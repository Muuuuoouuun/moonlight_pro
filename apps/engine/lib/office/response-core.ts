import { OFFICE_VERSION, OFFICE_DISCUSSION_VERSION, parseOfficeAnswer, parseOfficeDiscussion, type OfficeRequest, type OfficeContext, type OfficeAnswer } from '@com-moon/agent-contracts/office';
import type { generateGeminiText } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';
import { officeResponseSchema } from './response-schema.ts';
import { runOfficeDiscussion, discussionSynthesisPrompt, OfficeDiscussionError, reportOfficeDiagnostic, readOfficeWithDiagnostic, type OfficeDiagnosticCallback, type OfficeDiagnosticEvent } from './deliberation.ts';
import { buildOfficeSourceCatalog, officeSourceReviewPrompt, officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';
import { usageFor } from './usage.ts';

export type OfficeResponseExecution = { signal: AbortSignal; generate: typeof generateGeminiText; onDiagnostic?: OfficeDiagnosticCallback };

export async function runOfficeResponse(request: OfficeRequest, context: OfficeContext, execution: OfficeResponseExecution) {
  if (!(execution?.signal instanceof AbortSignal) || typeof execution.generate !== 'function') throw new TypeError('Office execution requires an AbortSignal and provider.');
  const { signal, generate, onDiagnostic } = execution;
  const startedAt = Date.now();
  const results: { usageMetadata?: unknown }[] = [];
  // 2026-09-23 운영자 확정: 자유 대화도 지연·토큰을 남긴다(본문 없음).
  const generation = () => ({ elapsedMs: Date.now() - startedAt, modelCalls: results.length, usage: usageFor(results) });
  const meta = { ownerId: request.ownerId, mode: request.mode, scope: request.scope, participants: request.participants, lens: null, simulation: request.mode === 'council', version: OFFICE_VERSION, context };
  const responseJsonSchema = officeResponseSchema(request.mode);
  const sourceCatalog = buildOfficeSourceCatalog(request, context);
  const reviewSchema = officeSourceReviewSchema(responseJsonSchema, sourceCatalog);
  const diagnostic = (phase: OfficeDiagnosticEvent['phase'], category: OfficeDiagnosticEvent['category']) => reportOfficeDiagnostic(onDiagnostic, { phase, category, ownerId: request.ownerId });
  const read = <T>(phase: OfficeDiagnosticEvent['phase'], category: OfficeDiagnosticEvent['category'], value: () => T) => readOfficeWithDiagnostic({ phase, category, ownerId: request.ownerId }, onDiagnostic, value);
  // One optional JSON fence; each boundary reports only its own failure category.
  const parseJson = (text: string, phase: OfficeDiagnosticEvent['phase']) => read(phase, 'json', () => JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')));
  const parseReviewed = (text: string, phase: 'review'|'synthesis') => {
    const raw = parseJson(text, phase);
    const reviewed = read(phase, 'source-review', () => readSourceReviewedOutput(raw, request, context, sourceCatalog));
    return { ...read(phase, 'contract', () => parseOfficeAnswer(reviewed.answer, request.mode)), sourceCheck: reviewed.sourceCheck };
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
  try {
    checkDeadline(request.mode === 'council' ? 'position' : 'draft');
    if (request.mode === 'council') {
      const roles = await runOfficeDiscussion(request, context, signal, generate, onDiagnostic);
      results.push(...roles.results);
      const latest = roles.turns.slice(-request.participants.length);
      const draft: OfficeAnswer = {
        answer: latest.map(turn => `${turn.ownerId}: ${turn.position}`).join('\n'),
        nextAction: '공개 판단과 사용자 요청에 맞는 다음 행동을 종합한다.',
        recommendation: latest.find(turn => turn.ownerId === request.ownerId)!.position,
        evidence: [...new Set(latest.flatMap(turn => turn.evidence))].slice(0, 5),
        dissent: latest.map(turn => turn.objection).filter(Boolean).slice(0, 5),
      };
      const review = officeSourceReviewPrompt(discussionSynthesisPrompt(buildOfficeReview(request, context, draft), roles), sourceCatalog);
      const reviewed = await call('synthesis', { ...review, model: roles.model, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
      if (!reviewed.ok || reviewed.model !== roles.model) {
        diagnostic('synthesis', signal.aborted ? 'deadline' : !reviewed.ok ? 'provider' : 'model-mismatch');
        throw new OfficeDiscussionError('synthesis-failed');
      }
      checkDeadline('synthesis');
      const answer = parseReviewed(reviewed.text, 'synthesis');
      const discussion = read('synthesis', 'contract', () => parseOfficeDiscussion({ version: OFFICE_DISCUSSION_VERSION, settings: roles.settings, turns: roles.turns, modelCalls: roles.results.length + 1 }, request));
      checkDeadline('synthesis');
      return { ...meta, status: 'generated', ...answer, model: reviewed.model, discussion, generation: generation() };
    }
    const result = await call('draft', { ...buildOfficePrompt(request, context), maxOutputTokens: 8192, signal, responseJsonSchema });
    if (!result.ok) {
      diagnostic('draft', signal.aborted ? 'deadline' : 'provider');
      return { ...meta, status: result.reason === 'missing-api-key' ? 'preview' : 'error', error: result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    const raw = parseJson(result.text, 'draft');
    const draft = read('draft', 'contract', () => parseOfficeAnswer(raw, request.mode));
    checkDeadline('draft');
    const review = officeSourceReviewPrompt(buildOfficeReview(request, context, draft), sourceCatalog);
    const reviewed = await call('review', { ...review, model: result.model, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
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
