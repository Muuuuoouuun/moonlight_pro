import { OFFICE_VERSION, OFFICE_DISCUSSION_VERSION, parseOfficeAnswer, parseOfficeDiscussion, type OfficeRequest, type OfficeContext, type OfficeAnswer } from '@com-moon/agent-contracts/office';
import { generateGeminiText } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';
import { officeResponseSchema } from './response-schema.ts';
import { runOfficeDiscussion, discussionSynthesisPrompt, OfficeDiscussionError } from './deliberation.ts';
import { officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';

function parseModelAnswer(text: string, mode: OfficeRequest['mode']) {
  // One optional JSON fence; never free text or executable model instructions.
  const raw = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1');
  return parseOfficeAnswer(JSON.parse(raw), mode);
}

export async function generateOfficeResponse(request: OfficeRequest, context: OfficeContext, generate = generateGeminiText) {
  const meta = { ownerId: request.ownerId, mode: request.mode, scope: request.scope, participants: request.participants, lens: null, simulation: request.mode === 'council', version: OFFICE_VERSION, context };
  // Every phase shares one deadline, inside Hub's 55s and Engine route's 60s budgets.
  const signal = AbortSignal.timeout(48_000);
  const responseJsonSchema = officeResponseSchema(request.mode);
  const reviewSchema = officeSourceReviewSchema(responseJsonSchema);
  const parseReviewed = (text: string) => parseOfficeAnswer(readSourceReviewedOutput(JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')), request, context), request.mode);
  try {
    if (request.mode === 'council') {
      const roles = await runOfficeDiscussion(request, context, signal, generate);
      const latest = roles.turns.slice(-request.participants.length);
      const draft: OfficeAnswer = {
        answer: latest.map(turn => `${turn.ownerId}: ${turn.position}`).join('\n'),
        nextAction: '공개 판단과 사용자 요청에 맞는 다음 행동을 종합한다.',
        recommendation: latest.find(turn => turn.ownerId === request.ownerId)!.position,
        evidence: [...new Set(latest.flatMap(turn => turn.evidence))].slice(0, 5),
        dissent: latest.map(turn => turn.objection).filter(Boolean).slice(0, 5),
      };
      const reviewed = await generate({ ...discussionSynthesisPrompt(buildOfficeReview(request, context, draft), roles), model: roles.model, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
      if (!reviewed.ok || reviewed.model !== roles.model) throw new OfficeDiscussionError('synthesis-failed');
      signal.throwIfAborted();
      const answer = parseReviewed(reviewed.text);
      const discussion = parseOfficeDiscussion({ version: OFFICE_DISCUSSION_VERSION, settings: roles.settings, turns: roles.turns, modelCalls: roles.results.length + 1 }, request);
      return { ...meta, status: 'generated', ...answer, model: reviewed.model, discussion };
    }
    const result = await generate({ ...buildOfficePrompt(request, context), maxOutputTokens: 8192, signal, responseJsonSchema });
    if (!result.ok) return { ...meta, status: result.reason === 'missing-api-key' ? 'preview' : 'error', error: result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    const draft = parseModelAnswer(result.text, request.mode);
    signal.throwIfAborted();
    const reviewed = await generate({ ...buildOfficeReview(request, context, draft), model: result.model, maxOutputTokens: 8192, signal, responseJsonSchema: reviewSchema, thinkingLevel: 'high' });
    if (!reviewed.ok || reviewed.model !== result.model) return { ...meta, status: 'error', error: '답변 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
    signal.throwIfAborted();
    const answer = parseReviewed(reviewed.text);
    return { ...meta, status: 'generated', ...answer, model: reviewed.model };
  } catch (error) {
    if (error instanceof OfficeDiscussionError && error.reason === 'missing-api-key') return { ...meta, status: 'preview', error: 'AI 연결이 필요합니다. 입력은 보존됩니다.' };
    return { ...meta, status: 'error', error: '응답 형식을 확인하거나 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  }
}
