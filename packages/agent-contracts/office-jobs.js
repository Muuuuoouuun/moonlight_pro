// 오피스 일감 고정표 — 2026-10-29 운영자 확정 A안(docs/superpowers/specs/2026-10-29-office-tab-improvement-plan.md §3 P2).
// 10-01 "10월에 실제로 쓰는 법" 표를 그대로 옮긴 것이라 모델 호출이 없다: 칩 하나가 범위·주관·관점·응답 방식·템플릿을 채운다.
// 회사 답장·원고는 회의실에서 하지 않고 그 자리로 보낸다(레인 규칙 — CRM 사실·브랜드 톤이 그곳에만 있다).
// 참석자 레일이 정본이다: 칩은 레일을 대신 채우는 버튼이고, 레일을 바꾸면 칩은 저절로 꺼진다(officeJobMatches).

export const OFFICE_JOB_TEMPLATES = Object.freeze({
  'sales-judgment': `[판매판단] 개인 레인 · 이미 가진 강의·소프트웨어·채널을 돈으로. 신규 개발 0.
상품·현재 가격·관련 브랜드:
결정할 것:
선택지:
알고 있는 사실(숫자·날짜):
확인 안 된 가용 시간·조건·고객 반응은 [확인 필요]로 표시하고 사실처럼 쓰지 말 것.
원하는 결과: 추천 1개 + 판단을 바꿀 조건 + 오늘 할 다음 행동 1개`,
  stuck: `[막힌일] (안건으로 가져온 할 일 아래에 붙인다)
막힌 이유(내 말로):
오늘 쓸 수 있는 시간:
원하는 결과: 다음 한 걸음 1개와 그걸 막는 확인 1개. 새 일을 만들지 말 것.`,
  'personal-reply': `[개인 답장] 개인 레인 · 강의·소프트웨어
상대:
상품·제시 가격:
지난 대화·약속:
원하는 결과: 보낼 답장 초안 1개. 숫자·날짜·가격은 내가 적은 사실만 쓰고, 확인 안 된 것은 [확인 필요]로 표시할 것.`,
});

export const OFFICE_JOBS = Object.freeze([
  { id: 'triage', label: '정리', scope: null, ownerId: 'eevee', reviewerIds: [], mode: 'chat', template: '',
    placeholder: '뭘 해야 할지 모르면 메모를 그대로 붙여 넣으세요. 이브이가 지금 결정할 질문부터 좁힙니다.' },
  { id: 'stuck', label: '막힌일', scope: null, ownerId: 'eevee', reviewerIds: [], mode: 'chat', template: OFFICE_JOB_TEMPLATES.stuck,
    placeholder: '왼쪽 `오래 멈춘 할 일`에서 안건을 가져온 뒤, 막힌 이유를 내 말로 적어 주세요.' },
  { id: 'sales-judgment', label: '판매판단', scope: 'personal', ownerId: 'espeon', reviewerIds: ['leafeon'], mode: 'council', template: OFFICE_JOB_TEMPLATES['sales-judgment'],
    placeholder: '가격·모집글·채널을 정할 때. 상품·현재 가격·선택지·아는 사실을 채워 주세요.' },
  { id: 'personal-reply', label: '개인 답장', scope: 'personal', ownerId: 'flareon', reviewerIds: [], mode: 'draft', template: OFFICE_JOB_TEMPLATES['personal-reply'],
    placeholder: '개인 판매(강의·소프트웨어) 가격 제시·후속 답장. 발송 전 숫자·날짜를 직접 대조하세요.' },
  { id: 'company-reply', label: '회사 답장', link: 'dashboard/revenue/customers', hint: '고객 상세 › 답장 패널(부스터·회사 범위)에서 씁니다. 복사는 발송 기록이 아닙니다.' },
  { id: 'copy', label: '원고', link: 'dashboard/brand/studio', hint: '콘텐츠 › 원고 작성(브랜드 소재 › AI 변환, 님피아)에서 씁니다.' },
]);

export const OFFICE_ROOM_JOBS = Object.freeze(OFFICE_JOBS.filter(job => !job.link));
export const OFFICE_LINK_JOBS = Object.freeze(OFFICE_JOBS.filter(job => job.link));

export function officeJobById(id) { return OFFICE_JOBS.find(job => job.id === id) || null; }

// 세션 설정이 칩 하나와 정확히 같을 때만 그 칩이 켜진다 — 저장할 상태가 없다.
export function officeJobMatches(job, session) {
  if (!job || job.link || !session) return false;
  const reviewers = Array.isArray(session.reviewers) ? session.reviewers : [];
  return session.ownerId === job.ownerId && session.mode === job.mode
    && reviewers.length === job.reviewerIds.length && job.reviewerIds.every(id => reviewers.includes(id));
}

export function officeActiveJob(session) { return OFFICE_ROOM_JOBS.find(job => officeJobMatches(job, session)) || null; }

// 칩이 레일에 넣을 값. 입력칸은 비어 있거나 다른 칩의 템플릿 그대로일 때만 바꾼다(운영자가 쓴 글은 덮지 않는다).
export function officeJobPatch(job, draft = '') {
  const current = String(draft || '').trim();
  const isTemplate = !current || OFFICE_ROOM_JOBS.some(other => other.template && other.template.trim() === current);
  return { ownerId: job.ownerId, reviewers: [...job.reviewerIds], mode: job.mode, presetId: null, ...(isTemplate ? { draft: job.template } : {}) };
}
