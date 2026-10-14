import { OFFICE_VERSION, OFFICE_DISCUSSION_VERSION, parseOfficeAnswer, parseOfficeDiscussion, type OfficeRequest, type OfficeContext, type OfficeAnswer, type OfficeDiscussionTurn } from '@com-moon/agent-contracts/office';
import type { generateGeminiText } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';
import { officeResponseSchema } from './response-schema.ts';
import { runOfficeDiscussion, discussionSynthesisPrompt, officeDiscussionSynthesisSchema, readOfficeSynthesisOutput, OfficeDiscussionError, reportOfficeDiagnostic, readOfficeWithDiagnostic, type OfficeDiagnosticCallback, type OfficeDiagnosticEvent } from './deliberation.ts';
import { buildOfficeSourceCatalog, officeSourceReviewPrompt, officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';
import { usageFor } from './usage.ts';
import { buildCompactOfficePrompt, compactOfficeArtifactReview, isCompactOfficeAuthoring, type OfficeAuthoringPolicy } from './authoring.ts';
import { compactSynthesisPrompt, compactSynthesisSchema, expandCompactSynthesis } from './synthesis-references.ts';
import { officeTaskDeliverySchema, readOfficeTaskDeliveryOutput } from './task-delivery.ts';

export type OfficeResponseExecution = { signal: AbortSignal; generate: typeof generateGeminiText; onDiagnostic?: OfficeDiagnosticCallback; authoring?: OfficeAuthoringPolicy };

export async function runOfficeResponse(request: OfficeRequest, context: OfficeContext, execution: OfficeResponseExecution) {
  if (!(execution?.signal instanceof AbortSignal) || typeof execution.generate !== 'function') throw new TypeError('Office execution requires an AbortSignal and provider.');
  const authoring = execution.authoring ?? 'reviewed-v25';
  if (authoring !== 'reviewed-v25' && !isCompactOfficeAuthoring(authoring)) throw new TypeError('Unknown Office authoring policy.');
  const compact = isCompactOfficeAuthoring(authoring);
  const reviewArtifact = authoring === 'compact-reviewed-v1';
  const taskDelivery = authoring === 'compact-delivery-v1';
  const { signal, generate, onDiagnostic } = execution;
  const startedAt = Date.now();
  const results: { usageMetadata?: unknown }[] = [];
  // 2026-09-23 운영자 확정: 자유 대화도 지연·토큰을 남긴다(본문 없음).
  const generation = () => ({ elapsedMs: Date.now() - startedAt, modelCalls: results.length, usage: usageFor(results) });
  const meta = { ownerId: request.ownerId, mode: request.mode, scope: request.scope, participants: request.participants, lens: null, simulation: request.mode === 'council', version: OFFICE_VERSION, context };
  const responseJsonSchema = officeResponseSchema(request.mode);
  const sourceCatalog = buildOfficeSourceCatalog(request, context);
  const reviewSchema = officeSourceReviewSchema(taskDelivery ? officeTaskDeliverySchema(responseJsonSchema) : responseJsonSchema, sourceCatalog);
  const diagnostic = (phase: OfficeDiagnosticEvent['phase'], category: OfficeDiagnosticEvent['category']) => reportOfficeDiagnostic(onDiagnostic, { phase, category, ownerId: request.ownerId });
  const read = <T>(phase: OfficeDiagnosticEvent['phase'], category: OfficeDiagnosticEvent['category'], value: () => T) => readOfficeWithDiagnostic({ phase, category, ownerId: request.ownerId }, onDiagnostic, value);
  // One optional JSON fence; each boundary reports only its own failure category.
  const parseJson = (text: string, phase: OfficeDiagnosticEvent['phase']) => read(phase, 'json', () => JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')));
  const parseReviewed = (text: string, phase: 'draft'|'review'|'synthesis', turns?: OfficeDiscussionTurn[]) => {
    const raw = parseJson(text, phase);
    const reviewed = read(phase, 'source-review', () => readSourceReviewedOutput(raw, request, context, sourceCatalog));
    const publicAnswer = taskDelivery ? read(phase, 'contract', () => readOfficeTaskDeliveryOutput(reviewed.answer, request.message)) : reviewed.answer;
    const synthesis = turns ? read(phase, 'contract', () => readOfficeSynthesisOutput(compact ? expandCompactSynthesis(publicAnswer, turns) : publicAnswer, turns)) : null;
    return { ...read(phase, 'contract', () => parseOfficeAnswer(synthesis?.answer ?? publicAnswer, request.mode)), sourceCheck: reviewed.sourceCheck, ...(synthesis ? { resolutions: synthesis.resolutions } : {}) };
  };
  const checkDeadline = (phase: OfficeDiagnosticEvent['phase']) => {
    if (signal.aborted) diagnostic(phase, 'deadline');
    signal.throwIfAborted();
  };
  const call = async (phase: OfficeDiagnosticEvent['phase'], input: Parameters<typeof generateGeminiText>[0]) => {
    checkDeadline(phase);
    let result;
    try { result = await generate(input); }
    catch (error) { diagnostic(phase, signal.aborted ? 'deadline' : 'provider'); throw error; }
    results.push(result);
    checkDeadline(phase);
    return result;
  };
  const finishCompactArtifact = async (prompt: { systemInstruction: string; prompt: string }, schema: Record<string, unknown>, parsed: ReturnType<typeof parseReviewed>, model: string, turns?: OfficeDiscussionTurn[]) => {
    // Only the parsed public fields cross this handoff. The original catalog and
    // actual discussion remain in the original prompt, outside the draft.
    const { sourceCheck: _sourceCheck, ...draft } = parsed;
    const reviewed = await call('review', { ...compactOfficeArtifactReview(prompt, draft), model, maxOutputTokens: 8192, signal, responseJsonSchema: schema, thinkingLevel: 'low', retries: 1 });
    if (!reviewed.ok || reviewed.model !== model) {
      diagnostic('review', signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch');
      throw new OfficeDiscussionError('artifact-review-failed');
    }
    const answer = parseReviewed(reviewed.text, 'review', turns);
    checkDeadline('review');
    return answer;
  };
  try {
    checkDeadline(request.mode === 'council' ? 'position' : 'draft');
    if (request.mode === 'council') {
      const roles = await runOfficeDiscussion(request, context, signal, generate, onDiagnostic, authoring);
      results.push(...roles.results);
      const latest = roles.turns.slice(-request.participants.length);
      const draft: OfficeAnswer = {
        answer: latest.map(turn => `${turn.ownerId}: ${turn.position}`).join('\n'),
        nextAction: '공개 판단과 사용자 요청에 맞는 다음 행동을 종합한다.',
        recommendation: latest.find(turn => turn.ownerId === request.ownerId)!.position,
        evidence: [...new Set(latest.flatMap(turn => turn.evidence))].slice(0, 5),
        dissent: latest.map(turn => turn.objection).filter(Boolean).slice(0, 5),
      };
      const synthesis = compact ? buildCompactOfficePrompt(request, context, authoring) : buildOfficeReview(request, context, draft);
      const reviewBase = officeSourceReviewPrompt(discussionSynthesisPrompt(synthesis, roles), sourceCatalog);
      const schemaBase = officeDiscussionSynthesisSchema(reviewSchema, roles.turns);
      const review = compact ? compactSynthesisPrompt(reviewBase, roles.turns) : reviewBase;
      const schema = compact ? compactSynthesisSchema(schemaBase, roles.turns) : schemaBase;
      const reviewed = await call('synthesis', { ...review, model: roles.model, maxOutputTokens: 8192, signal, responseJsonSchema: schema, thinkingLevel: compact ? 'low' : 'high', retries: 1 });
      if (!reviewed.ok || reviewed.model !== roles.model) {
        diagnostic('synthesis', signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch');
        throw new OfficeDiscussionError('synthesis-failed');
      }
      checkDeadline('synthesis');
      const parsed = parseReviewed(reviewed.text, 'synthesis', roles.turns);
      const initialDiscussion = read('synthesis', 'contract', () => parseOfficeDiscussion({ version: OFFICE_DISCUSSION_VERSION, settings: roles.settings, turns: roles.turns, modelCalls: roles.results.length + 1, resolutions: parsed.resolutions }, request));
      const { resolutions, ...answer } = reviewArtifact ? await finishCompactArtifact(review, schema, parsed, roles.model, roles.turns) : parsed;
      const phase = reviewArtifact ? 'review' : 'synthesis';
      const discussion = reviewArtifact ? read('review', 'contract', () => parseOfficeDiscussion({ ...initialDiscussion, modelCalls: roles.results.length + 2, artifactReviewCalls: 1, resolutions }, request)) : initialDiscussion;
      checkDeadline(phase);
      return { ...meta, status: 'generated', ...answer, model: reviewed.model, discussion, generation: generation() };
    }
    if (compact) {
      const prompt = officeSourceReviewPrompt(buildCompactOfficePrompt(request, context, authoring), sourceCatalog);
      const result = await call('draft', { ...prompt, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'low', retries: 1 });
      if (!result.ok) {
        diagnostic('draft', signal.aborted ? 'deadline' : 'provider');
        return { ...meta, status: result.reason === 'missing-api-key' ? 'preview' : 'error', error: result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
      }
      const parsed = parseReviewed(result.text, 'draft');
      checkDeadline('draft');
      const answer = reviewArtifact ? await finishCompactArtifact(prompt, reviewSchema, parsed, result.model) : parsed;
      checkDeadline(reviewArtifact ? 'review' : 'draft');
      return { ...meta, status: 'generated', ...answer, model: result.model, generation: generation() };
    }
    const result = await call('draft', { ...buildOfficePrompt(request, context), maxOutputTokens: 8192, signal, responseJsonSchema, retries: 1 });
    if (!result.ok) {
      diagnostic('draft', signal.aborted ? 'deadline' : 'provider');
      return { ...meta, status: result.reason === 'missing-api-key' ? 'preview' : 'error', error: result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    const raw = parseJson(result.text, 'draft');
    const draft = read('draft', 'contract', () => parseOfficeAnswer(raw, request.mode));
    checkDeadline('draft');
    const review = officeSourceReviewPrompt(buildOfficeReview(request, context, draft), sourceCatalog);
    const reviewed = await call('review', { ...review, model: result.model, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'high', retries: 1 });
    if (!reviewed.ok || reviewed.model !== result.model) {
      diagnostic('review', signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch');
      return { ...meta, status: 'error', error: '답변 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
    }
    checkDeadline('review');
    const answer = parseReviewed(reviewed.text, 'review');
    checkDeadline('review');
    return { ...meta, status: 'generated', ...answer, model: reviewed.model, generation: generation() };
  } catch (error) {
    if (!signal.aborted && error instanceof OfficeDiscussionError && error.reason === 'missing-api-key') return { ...meta, status: 'preview', error: 'AI 연결이 필요합니다. 입력은 보존됩니다.' };
    return { ...meta, status: 'error', error: '응답 형식을 확인하거나 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  }
}
