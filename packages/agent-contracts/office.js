// Browser-safe Office contract. Legacy persona/Guru/Council IDs remain independent.
export const OFFICE_VERSION = '2026-09-15.v1';
export const OFFICE_ROSTER = Object.freeze([
  {
    "id": "eevee",
    "name": "이브이",
    "role": "비서실장",
    "character": "친근하고 기민한 조율자",
    "quote": "복잡한 건 내가 정리할게. 지금 결정할 것부터 보자."
  },
  {
    "id": "vaporeon",
    "name": "샤미드",
    "role": "운영총괄",
    "character": "차분하고 끈기 있는 해결사",
    "quote": "끝낼 수 있는 순서로 풀자."
  },
  {
    "id": "jolteon",
    "name": "쥬피썬더",
    "role": "기술총괄",
    "character": "빠르고 솔직한 실행가",
    "quote": "작게 붙여서 돌려보자. 확인한 결과로 얘기할게."
  },
  {
    "id": "flareon",
    "name": "부스터",
    "role": "매출총괄",
    "character": "적극적이고 끈질긴 고객 전략가",
    "quote": "고객이 받아들일 다음 한 걸음으로."
  },
  {
    "id": "espeon",
    "name": "에브이",
    "role": "전략총괄",
    "character": "관찰력 있고 절제된 전략가",
    "quote": "이 선택이 다음 선택을 어떻게 바꾸는지 보자."
  },
  {
    "id": "umbreon",
    "name": "블래키",
    "role": "리스크총괄",
    "character": "조용하고 공정한 검토자",
    "quote": "이 결론을 믿어도 되는 근거부터 확인하자."
  },
  {
    "id": "leafeon",
    "name": "리피아",
    "role": "재무·자원총괄",
    "character": "다정하지만 계산은 정확한 관리자",
    "quote": "돈과 시간을 같이 보자."
  },
  {
    "id": "glaceon",
    "name": "글레이시아",
    "role": "제품총괄",
    "character": "명료하고 단단한 설계자",
    "quote": "무엇이 되면 완료인지부터 선명하게 만들자."
  },
  {
    "id": "sylveon",
    "name": "님피아",
    "role": "브랜드·마케팅총괄",
    "character": "따뜻하고 예리한 편집장",
    "quote": "상대가 알아듣는 말로 바꿔보자."
  }
].map(Object.freeze));
export const OFFICE_IDS = Object.freeze(OFFICE_ROSTER.map(p => p.id));
export const OFFICE_MODES = Object.freeze(['chat', 'draft', 'review', 'council']);
export const OFFICE_SCOPES = Object.freeze(['all', 'classin', 'personal']);
// Legend integration deliberately unavailable until versioned source cards are connected.
export const OFFICE_LENSES = Object.freeze([]);
export class OfficeInputError extends Error {}
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
function check(ok, message) { if (!ok) throw new OfficeInputError(message); }
function keys(x, allowed) { check(plain(x) && Object.keys(x).every(k => allowed.includes(k)), '지원하지 않는 입력 필드입니다.'); }
function text(x, max) { check(typeof x === 'string' && x.trim().length > 0 && x.length <= max, '본문 길이를 확인해 주세요.'); return x.trim(); }
export function parseOfficeRequest(value) {
  keys(value, ['ownerId','mode','scope','message','participants','lens','history','includeProjects']);
  const {ownerId = 'eevee', mode = 'chat', scope = 'all', lens = null} = value;
  check(OFFICE_IDS.includes(ownerId), '등록되지 않은 Office 담당입니다.');
  check(OFFICE_MODES.includes(mode), '지원하지 않는 Office 모드입니다.');
  check(OFFICE_SCOPES.includes(scope), '지원하지 않는 업무 범위입니다.');
  check(lens === null, 'Legend 관점은 아직 Office에 연결되지 않았습니다.');
  const participants = value.participants ?? [];
  check(Array.isArray(participants) && new Set(participants).size === participants.length && participants.every(p => OFFICE_IDS.includes(p)), '회의 참여자를 확인해 주세요.');
  check(mode === 'council' ? participants.includes(ownerId) && participants.length >= 2 && participants.length <= 3 : participants.length === 0, '회의는 주관을 포함해 2~3개의 관점을 선택해 주세요.');
  const history = value.history ?? [];
  check(Array.isArray(history) && history.length <= 8, '최근 대화는 최대 8개입니다.');
  const normalizedHistory = history.map(turn => {
    keys(turn, ['role','text']);
    check(['user','assistant'].includes(turn.role), '대화 역할이 올바르지 않습니다.');
    return {role:turn.role, text:text(turn.text, 6000)};
  });
  check(JSON.stringify(normalizedHistory).length <= 20000, '대화 문맥이 너무 깁니다. 새 대화를 시작해 주세요.');
  check(value.includeProjects === undefined || typeof value.includeProjects === 'boolean', '프로젝트 참조 설정이 올바르지 않습니다.');
  return {ownerId, mode, scope, lens:null, message:text(value.message,6000), participants:[...participants], history:normalizedHistory, includeProjects:value.includeProjects === true};
}
export function parseOfficeAnswer(value, mode) {
  keys(value, ['answer','nextAction','recommendation','evidence','dissent']);
  const result = {answer:text(value.answer,10000), nextAction:text(value.nextAction,1000)};
  if (mode === 'council') {
    result.recommendation = text(value.recommendation,2000);
    for (const key of ['evidence','dissent']) {
      check(Array.isArray(value[key]) && value[key].length <= 5, '회의 결과 형식이 올바르지 않습니다.');
      result[key] = value[key].map(item => text(item,1000));
    }
  } else check(value.recommendation === undefined && value.evidence === undefined && value.dissent === undefined, '개별 응답 형식이 올바르지 않습니다.');
  return result;
}
export function parseOfficeContext(value, scope) {
  keys(value, ['source','scope','projects','note']);
  check(value.scope === scope && ['provided','live','partial','preview','error'].includes(value.source), '업무 문맥 범위가 일치하지 않습니다.');
  check(Array.isArray(value.projects) && value.projects.length <= 8, '프로젝트 문맥이 너무 큽니다.');
  const projects = value.projects.map(row => {
    keys(row,['id','name','status','scope']);
    check(typeof row.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id), '프로젝트 ID가 올바르지 않습니다.');
    check(['classin','personal','unknown'].includes(row.scope) && (scope === 'all' || row.scope === scope), '다른 범위의 프로젝트는 사용할 수 없습니다.');
    return {id:row.id,name:text(row.name,300),status:text(row.status,80),scope:row.scope};
  });
  check(!['provided','preview','error'].includes(value.source) || projects.length === 0, '연결 상태와 프로젝트 자료가 일치하지 않습니다.');
  return {source:value.source,scope,projects,note:text(value.note,1000)};
}
