// 확인할 것 — 신호 한 장의 종류·키·끝내기 목록(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §4.2).
//
// 순수 모듈이다. daily-brief 라우트가 신호를 만든 뒤 여기서 카드 모양을 붙이고, 클라이언트는
// `outcomes[].kind`로 저장하는 끝내기(write)와 화면만 여는 링크(navigate)를 가른다. 화면만 여는 것은
// 끝낸 것으로 세지 않는다(§4.1).

export const SUBJECT_TYPES = Object.freeze(['deal', 'lead', 'account', 'project', 'automation', 'content', 'lead-group', 'risk']);
export const OUTCOME_KINDS = Object.freeze(['contact_logged', 'task_created', 'rescheduled', 'snoozed', 'unblocked', 'decision_logged', 'scheduled']);
// 고객·거래·리드는 보류의 정본이 대상 meta.nudges다(넛지와 같은 저장, §4.3).
export const CRM_SUBJECT_TYPES = Object.freeze(new Set(['deal', 'lead', 'account']));

const KIND_LABELS = Object.freeze({
  deal: '거래',
  lead: '리드',
  account: '고객',
  'lead-group': '리드',
  project: '프로젝트',
  automation: '자동화',
  content: '콘텐츠',
  risk: '위험',
});

const KEY_PREFIX = Object.freeze({
  deal: 'revenue-stale',
  lead: 'lead',
  account: 'account',
  'lead-group': 'revenue-new-leads',
  project: 'work-blocked',
  automation: 'automation-failed',
  content: 'content',
  risk: 'risk',
});

// 기록이 남는 끝내기의 공통 조각.
const TASK = (record) => ({ key: 'task', label: '할 일로 만들기', record, kind: 'write' });
const SNOOZE = { key: 'snooze', label: '보류 · 다시 볼 날', record: '다시 볼 날과 이유', kind: 'write' };
const open = (label, action) => ({ key: 'open', label, record: '', kind: 'navigate', action });

const CATALOG = Object.freeze({
  deal: {
    outcomes: [
      { key: 'contact', label: '연락 기록 남기기', record: '고객 활동 1건, 다음 연락일', kind: 'write' },
      TASK('할 일 1건 (이 거래에 연결)'),
      { key: 'reschedule', label: '날짜 다시 정하기', record: '다음 연락일', kind: 'write' },
      SNOOZE,
    ],
    links: [{ label: '거래 열기', action: 'deals' }],
    taskTitle: (name) => `${name} 다음 연락`,
    schedule: { minutes: 20, verb: '연락 기록' },
  },
  'lead-group': {
    outcomes: [open('분류하러 가기', 'leads'), TASK('할 일 1건'), SNOOZE],
    links: [],
    taskTitle: (name) => `${name} 분류`,
    schedule: { minutes: 20, verb: '분류' },
  },
  automation: {
    outcomes: [open('실행 기록에서 원인 보기', 'review'), TASK('할 일 1건'), SNOOZE],
    links: [{ label: '자동화 확인', action: 'automations' }],
    taskTitle: (name) => `${name} 실패 원인 확인`,
    schedule: { minutes: 15, verb: '원인 보기' },
  },
  content: {
    outcomes: [open('이어쓰기', 'write'), TASK('할 일 1건'), SNOOZE],
    links: [{ label: '소재·제작 보기', action: 'queue' }],
    taskTitle: (name) => `${name} 이어쓰기`,
    schedule: { minutes: 45, verb: '이어쓰기' },
  },
  project: {
    // 막힘 풀기(§5)가 붙기 전까지는 프로젝트를 여는 것이 1번이다 — 단계 3에서 바뀐다.
    outcomes: [open('프로젝트 열기', 'projects'), TASK('할 일 1건 (이 프로젝트에 연결)'), SNOOZE],
    links: [],
    taskTitle: (name) => `${name} 막힌 점 풀기`,
    // 병목이 의사결정이면 30분 '정하기'(§4.7) — 병목 분류는 단계 3에서 붙는다.
    schedule: { minutes: 15, verb: '막힌 점 확인' },
  },
  risk: {
    outcomes: [open('구성 항목 보기', 'revenue'), SNOOZE],
    links: [{ label: '프로젝트 보기', action: 'projects' }],
    taskTitle: (name) => `${name} 정리`,
    schedule: { minutes: 15, verb: '정리' },
  },
});

// 시간 잡기 일정 제목 — 카드(toCheckItem)와 레일의 다른 시간(구글 일정 갱신)이 같은 문장을 쓴다.
export function scheduleTitleFor(type, name) {
  const verb = CATALOG[type]?.schedule?.verb || '확인';
  return `확인할 것 · ${String(name || '').trim()} ${verb}`.slice(0, 200);
}

export function scheduleMinutesFor(type) {
  return CATALOG[type]?.schedule?.minutes || 30;
}

// 묶음 키용 짧은 해시(djb2) — 같은 리드 묶음이면 같은 키, 리드가 하나라도 바뀌면 새 키다(Q-CF7).
export function shortHash(text) {
  let hash = 5381;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export function signalKeyFor(subject) {
  if (!subject || !SUBJECT_TYPES.includes(subject.type)) return null;
  const prefix = KEY_PREFIX[subject.type];
  if (subject.type === 'lead-group') {
    const ids = Array.isArray(subject.ids) ? [...subject.ids].map(String).sort() : [];
    return ids.length ? `${prefix}:${shortHash(ids.join(','))}` : null;
  }
  const id = String(subject.id || '').trim();
  return id ? `${prefix}:${id.slice(0, 180)}` : null;
}

// 신호에 카드 모양을 붙인다. subject가 없거나 모르는 종류면 끝내기 없이 그대로 둔다 — 키 없이 저장하면
// 억제가 어긋난다. 그런 카드는 기존 링크(decisions)만 쓴다.
export function toCheckItem(signal) {
  const subject = signal?.subject;
  const entry = subject ? CATALOG[subject.type] : null;
  const signalKey = signalKeyFor(subject);
  if (!entry || !signalKey) return { ...signal, signalKey: null, kindLabel: signal?.kind || '', outcomes: [], links: [] };
  const name = String(subject.name || signal.title || '').trim();
  return {
    ...signal,
    signalKey,
    kindLabel: KIND_LABELS[subject.type],
    outcomes: entry.outcomes.map((outcome, index) => ({ ...outcome, primary: index === 0 })),
    links: entry.links,
    taskTitle: entry.taskTitle(name).slice(0, 300),
    // 시간 잡기 기본 소요 시간·동사(§4.7 표, Q-CF10 승인).
    schedule: { ...entry.schedule, title: scheduleTitleFor(subject.type, name) },
  };
}
