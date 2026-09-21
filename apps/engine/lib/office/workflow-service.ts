import { createHash } from 'node:crypto';
import { OFFICE_WORKFLOW_VERSION, parseOfficeWorkflowAnswer, parseOfficeWorkflowResult, type OfficeWorkflowRequest, type OfficeWorkflowContext, type OfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';
import { generateGeminiText } from '../gemini.ts';
import { buildOfficeWorkflowPrompt, buildOfficeWorkflowReview, OFFICE_WORKFLOW_POLICY_VERSION } from './workflow-prompt.ts';
import { officeWorkflowResponseSchema } from './workflow-response-schema.ts';

function parseModel(text: string, request: OfficeWorkflowRequest, context: OfficeWorkflowContext) {
  const raw = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1');
  return parseOfficeWorkflowAnswer(JSON.parse(raw), request, context);
}

function usageFor(results: { usageMetadata?: unknown }[]) {
  const counts = results.map(result => result.usageMetadata as Record<string, unknown> | null | undefined);
  const fields = ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'] as const;
  if (counts.some(count => !count || fields.some(key => !Number.isSafeInteger(count[key]) || Number(count[key]) < 0))) return null;
  const sum = (key: typeof fields[number]) => counts.reduce((total, count) => total + Number(count![key]), 0);
  return { promptTokens: sum('promptTokenCount'), outputTokens: sum('candidatesTokenCount'), totalTokens: sum('totalTokenCount') };
}

// Hub owns durable claim and finish. This service never retries a model call or writes a task.
export async function generateOfficeWorkflow(request: OfficeWorkflowRequest, context: OfficeWorkflowContext, generate = generateGeminiText): Promise<OfficeWorkflowResult> {
  const meta = { version: OFFICE_WORKFLOW_VERSION, requestId: request.requestId, ownerId: request.ownerId, mode: request.mode, participants: request.participants, scope: request.scope };
  const failure = (status: 'preview'|'error', error: string): OfficeWorkflowResult => ({ ...meta, status, error });
  if (context.status !== 'ready' || !context.capabilities.generate) return failure(context.status === 'error' ? 'error' : 'preview', '업무 자료와 AI 연결을 확인한 뒤 다시 요청해 주세요.');
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(48_000);
  const responseJsonSchema = officeWorkflowResponseSchema(request.mode);
  try {
    const prompt = buildOfficeWorkflowPrompt(request, context);
    const result = await generate({ ...prompt, signal, maxOutputTokens: 8192, responseJsonSchema });
    if (!result.ok) return failure(result.reason === 'missing-api-key' ? 'preview' : 'error', result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 요청 상태를 확인해 주세요.');
    signal.throwIfAborted();
    const draft = parseModel(result.text, request, context);
    const review = buildOfficeWorkflowReview(request, context, draft);
    const reviewed = await generate({ ...review, model: result.model, signal, maxOutputTokens: 8192, responseJsonSchema, thinkingLevel: 'high' });
    if (!reviewed.ok || reviewed.model !== result.model) return failure('error', '답변 검수를 마치지 못했습니다. 입력은 보존됩니다.');
    signal.throwIfAborted();
    const answer = parseModel(reviewed.text, request, context);
    return parseOfficeWorkflowResult({
      ...meta, status: 'generated', resultRevision: 1, ...answer,
      context: { asOf: context.asOf, contextHash: context.contextHash, missing: context.missing },
      generation: { policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, promptHash: createHash('sha256').update(JSON.stringify({ policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, prompt, review })).digest('hex'), model: reviewed.model, usage: usageFor([result, reviewed]), elapsedMs: Date.now() - startedAt },
    }, request, context);
  } catch {
    return failure('error', '응답 형식 또는 검수를 확인하지 못했습니다. 입력을 유지하고 요청 상태를 확인해 주세요.');
  }
}
