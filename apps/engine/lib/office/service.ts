import { OFFICE_VERSION, parseOfficeAnswer, type OfficeRequest, type OfficeContext } from '@com-moon/agent-contracts/office';
import { generateGeminiText } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';
import { buildOfficeReview } from './review.ts';
import { officeResponseSchema } from './response-schema.ts';

function parseModelAnswer(text: string, mode: OfficeRequest['mode']) {
  // One optional JSON fence; never free text or executable model instructions.
  const raw = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1');
  return parseOfficeAnswer(JSON.parse(raw), mode);
}

export async function generateOfficeResponse(request: OfficeRequest, context: OfficeContext, generate = generateGeminiText) {
  const meta = { ownerId: request.ownerId, mode: request.mode, scope: request.scope, participants: request.participants, lens: null, simulation: request.mode === 'council', version: OFFICE_VERSION, context };
  // Both calls share one deadline, inside Hub's 55s and Engine route's 60s budgets.
  const signal = AbortSignal.timeout(48_000);
  const responseJsonSchema = officeResponseSchema(request.mode);
  try {
    const result = await generate({ ...buildOfficePrompt(request, context), maxOutputTokens: 8192, signal, responseJsonSchema });
    if (!result.ok) return { ...meta, status: result.reason === 'missing-api-key' ? 'preview' : 'error', error: result.reason === 'missing-api-key' ? 'AI 연결이 필요합니다. 입력은 보존됩니다.' : 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    const draft = parseModelAnswer(result.text, request.mode);
    signal.throwIfAborted();
    const reviewed = await generate({ ...buildOfficeReview(request, context, draft), maxOutputTokens: 8192, signal, responseJsonSchema, thinkingLevel: 'high' });
    if (!reviewed.ok) return { ...meta, status: 'error', error: '답변 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
    signal.throwIfAborted();
    const answer = parseModelAnswer(reviewed.text, request.mode);
    return { ...meta, status: 'generated', ...answer, model: reviewed.model };
  } catch {
    return { ...meta, status: 'error', error: '응답 형식을 확인하거나 검수를 마치지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.' };
  }
}
