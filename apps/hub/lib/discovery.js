import { isCanonicalUuid } from './uuid.js';
import { isDailyReviewDate } from './daily-review.js';

export const DISCOVERY_STATUSES = ['captured', 'exploring', 'validating', 'connected', 'paused', 'closed'];
export const DISCOVERY_TEXT_FIELDS = ['evidence', 'hypothesis', 'experiment', 'findings', 'decisionReason', 'resumeCondition'];
export const DISCOVERY_TARGET_TYPES = ['task', 'project', 'lead', 'deal'];
const FIELDS = ['id', 'requestId', 'expectedRevision', 'title', 'orgScope', 'discoveryMode', 'status', ...DISCOVERY_TEXT_FIELDS, 'reviewDate', 'links'];

export function validateDiscoveryInput(payload) {
  const invalid = (message = '기회 탐색 입력을 확인해 주세요.') => ({ ok: false, error: 'invalid-input', message });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || FIELDS.some((key) => !Object.hasOwn(payload, key))) return invalid('모든 입력 항목을 함께 보내 주세요.');
  if (!(payload.id === null || isCanonicalUuid(payload.id)) || !isCanonicalUuid(payload.requestId)
    || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 || payload.expectedRevision >= Number.MAX_SAFE_INTEGER
    || (payload.id === null && payload.expectedRevision !== 0)) return invalid('저장할 기록과 버전을 확인해 주세요.');
  if (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 300) return invalid('가능성을 300자 이내로 입력해 주세요.');
  if (!['personal', 'classin'].includes(payload.orgScope) || !['capture', 'research'].includes(payload.discoveryMode) || !DISCOVERY_STATUSES.includes(payload.status)) return invalid();
  if (DISCOVERY_TEXT_FIELDS.some((key) => typeof payload[key] !== 'string' || payload[key].length > 4000)) return invalid('각 기록은 4000자 이내로 입력해 주세요.');
  if (payload.reviewDate !== null && !isDailyReviewDate(payload.reviewDate)) return invalid('다시 볼 날짜를 확인해 주세요.');
  if (!Array.isArray(payload.links) || payload.links.length > 30 || payload.links.some((link) => !link || !DISCOVERY_TARGET_TYPES.includes(link.type) || !isCanonicalUuid(link.id))) return invalid('연결할 항목을 확인해 주세요.');
  const links = payload.links.map(({type,id}) => ({type,id:id.toLowerCase()}));
  if (new Set(links.map(({type,id}) => `${type}:${id}`)).size !== links.length) return invalid('같은 항목은 한 번만 연결할 수 있어요.');
  if (payload.status === 'connected' && !links.some(({type}) => type !== 'task')) return invalid('실행 연결에는 프로젝트·리드·거래 중 하나를 연결해 주세요.');
  if (payload.status === 'paused' && !payload.reviewDate && !payload.resumeCondition.trim()) return invalid('보류할 때는 다시 볼 날짜나 재개 조건을 남겨 주세요.');
  if (payload.status === 'closed' && !payload.decisionReason.trim()) return invalid('종료한 이유를 남겨 주세요.');
  return {ok:true,value:{...Object.fromEntries(FIELDS.map((key) => [key,payload[key]])),id:payload.id?.toLowerCase() ?? null,requestId:payload.requestId.toLowerCase(),links}};
}
