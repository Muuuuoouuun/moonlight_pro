import { createHash } from 'node:crypto';
import { OFFICE_WORKFLOW_VERSION, parseOfficeWorkflowAnswer, parseOfficeWorkflowResult, type OfficeWorkflowRequest, type OfficeWorkflowContext, type OfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';
import type { generateGeminiText } from '../gemini.ts';
import { buildOfficeWorkflowPrompt, buildOfficeWorkflowReview, OFFICE_WORKFLOW_POLICY_VERSION } from './workflow-prompt.ts';
import { officeWorkflowResponseSchema } from './workflow-response-schema.ts';
import { OFFICE_DISCUSSION_VERSION, parseOfficeDiscussion, officeFailureMessage } from '@com-moon/agent-contracts/office';
import { runOfficeDiscussion, discussionSynthesisPrompt, OfficeDiscussionError, type OfficeDiagnosticEvent } from './deliberation.ts';
import { buildOfficeSourceCatalog, officeSourceReviewPrompt, officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';
import { usageFor } from './usage.ts';

function parseModel(text: string, request: OfficeWorkflowRequest, context: OfficeWorkflowContext) {
  const raw = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1');
  return parseOfficeWorkflowAnswer(JSON.parse(raw), request, context);
}


export type OfficeWorkflowExecution = { signal: AbortSignal; generate: typeof generateGeminiText };

// Hub owns durable claim and finish. This core never retries a model call or writes a task.
export async function runOfficeWorkflow(request: OfficeWorkflowRequest, context: OfficeWorkflowContext, execution: OfficeWorkflowExecution): Promise<OfficeWorkflowResult> {
  if (!(execution?.signal instanceof AbortSignal) || typeof execution.generate !== 'function') throw new TypeError('Office execution requires an AbortSignal and provider.');
  const { signal, generate } = execution;
  const meta = { version: OFFICE_WORKFLOW_VERSION, requestId: request.requestId, ownerId: request.ownerId, mode: request.mode, participants: request.participants, scope: request.scope };
  const failure = (status: 'preview'|'error', error: string): OfficeWorkflowResult => ({ ...meta, status, error });
  // 2026-09-23 운영자 확정: 실패는 어느 단계에서 무엇 때문인지 분류만 싣는다 — 제공자 문구·예외는 싣지 않는다.
  type Phase = OfficeDiagnosticEvent['phase']; type Category = OfficeDiagnosticEvent['category'];
  const failed = (phase: Phase, category: Category): OfficeWorkflowResult => ({ ...meta, status: 'error', error: officeFailureMessage({ category }), failure: { phase, category } });
  let phase: Phase = request.mode === 'council' ? 'position' : 'draft';
  let first: OfficeDiagnosticEvent | null = null;
  const onDiagnostic = (event: OfficeDiagnosticEvent) => { first ??= event; };
  if (context.status !== 'ready' || !context.capabilities.generate) return failure(context.status === 'error' ? 'error' : 'preview', '업무 자료와 AI 연결을 확인한 뒤 다시 요청해 주세요.');
  const startedAt = Date.now();
  const responseJsonSchema = officeWorkflowResponseSchema(request.mode);
  const reviewSource = { facts: context.facts, sourceRefs: context.sourceRefs, missing: context.missing, asOf: context.asOf };
  const sourceCatalog = buildOfficeSourceCatalog(request, reviewSource);
  const reviewSchema = officeSourceReviewSchema(responseJsonSchema, sourceCatalog);
  const parseReviewed = (text: string) => {
    const reviewed = readSourceReviewedOutput(JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')), request, reviewSource, sourceCatalog);
    // The contract upgrades this to 'untraced' when every returned evidence ref falls outside the sources.
    return parseOfficeWorkflowAnswer({ ...reviewed.answer, sourceCheck: reviewed.sourceCheck }, request, context);
  };
  const call = async (input: Parameters<typeof generateGeminiText>[0]) => {
    signal.throwIfAborted();
    const result = await generate(input);
    signal.throwIfAborted();
    return result;
  };
  try {
    signal.throwIfAborted();
    if (request.mode === 'council') {
      const source = { scope: context.scope, ...reviewSource };
      const roles = await runOfficeDiscussion(request, source, signal, generate, onDiagnostic);
      phase = 'synthesis';
      const latest = roles.turns.slice(-request.participants.length);
      const draft = {
        summary: '역할별 공개 판단을 원문과 대조해 요청한 결과물을 작성한다.',
        artifact: { kind: 'text' as const, body: latest.map(turn => `${turn.ownerId}: ${turn.position}`).join('\n') },
        evidence: [], uncertainties: [...context.missing], dissent: latest.map(turn => turn.objection).filter(Boolean), nextStep: null,
        council: { perspectives: latest.map(turn => ({ ownerId: turn.ownerId, judgment: turn.position, tradeoff: turn.objection || turn.revisionCondition })), recommendation: latest.find(turn => turn.ownerId === request.ownerId)!.position },
      };
      const review = officeSourceReviewPrompt(discussionSynthesisPrompt(buildOfficeWorkflowReview(request, context, draft), roles), sourceCatalog);
      const reviewed = await call({ ...review, model: roles.model, signal, maxOutputTokens: 8192, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
      if (!reviewed.ok || reviewed.model !== roles.model) {
        first ??= { phase: 'synthesis', category: signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch' };
        throw new OfficeDiscussionError('synthesis-failed');
      }
      signal.throwIfAborted();
      const answer = parseReviewed(reviewed.text);
      const discussion = parseOfficeDiscussion({ version: OFFICE_DISCUSSION_VERSION, settings: roles.settings, turns: roles.turns, modelCalls: roles.results.length + 1 }, request);
      signal.throwIfAborted();
      return parseOfficeWorkflowResult({ ...meta, status: 'generated', resultRevision: 1, ...answer, discussion,
        context: { asOf: context.asOf, contextHash: context.contextHash, missing: context.missing },
        generation: { policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, promptHash: createHash('sha256').update(JSON.stringify({ policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, roles: roles.prompts, review })).digest('hex'), model: reviewed.model, usage: usageFor([...roles.results, reviewed]), elapsedMs: Date.now() - startedAt },
      }, request, context);
    }
    const prompt = buildOfficeWorkflowPrompt(request, context);
    const result = await call({ ...prompt, signal, maxOutputTokens: 8192, responseJsonSchema });
    if (!result.ok) return result.reason === 'missing-api-key' ? failure('preview', 'AI 연결이 필요합니다. 입력은 보존됩니다.') : failed('draft', signal.aborted ? 'deadline' : 'provider');
    signal.throwIfAborted();
    const draft = parseModel(result.text, request, context);
    phase = 'review';
    const review = officeSourceReviewPrompt(buildOfficeWorkflowReview(request, context, draft), sourceCatalog);
    const reviewed = await call({ ...review, model: result.model, signal, maxOutputTokens: 8192, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
    if (!reviewed.ok || reviewed.model !== result.model) return failed('review', signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch');
    signal.throwIfAborted();
    const answer = parseReviewed(reviewed.text);
    signal.throwIfAborted();
    return parseOfficeWorkflowResult({
      ...meta, status: 'generated', resultRevision: 1, ...answer,
      context: { asOf: context.asOf, contextHash: context.contextHash, missing: context.missing },
      generation: { policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, promptHash: createHash('sha256').update(JSON.stringify({ policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, prompt, review })).digest('hex'), model: reviewed.model, usage: usageFor([result, reviewed]), elapsedMs: Date.now() - startedAt },
    }, request, context);
  } catch (error) {
    if (!signal.aborted && error instanceof OfficeDiscussionError && error.reason === 'missing-api-key') return failure('preview', 'AI 연결이 필요합니다. 입력은 보존됩니다.');
    const root = first as OfficeDiagnosticEvent | null;
    const category: Category = signal.aborted ? 'deadline' : root?.category
      ?? (error instanceof SyntaxError ? 'json' : /source-review/.test(String((error as Error)?.message)) ? 'source-review' : 'contract');
    return failed(root?.phase ?? phase, category);
  }
}
