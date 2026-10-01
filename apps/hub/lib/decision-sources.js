// 결정 일지의 출처(확인할 것 스펙 §6) — 저장된 `meta.source` 문자열을 화면의 다섯 갈래로 읽는다.
// 순수 모듈: 기록(work-ledger)과 화면(Decisions)이 같은 표를 쓴다.

export const DECISION_SOURCES = Object.freeze([
  { key: 'unblock', label: '막힘 풀기' },
  { key: 'meeting', label: '회의' },
  { key: 'memo', label: '메모' },
  { key: 'check-items', label: '확인할 것' },
  { key: 'manual', label: '직접' },
]);

const LABELS = Object.freeze(Object.fromEntries(DECISION_SOURCES.map((source) => [source.key, source.label])));

export function decisionSourceKey(source) {
  const value = String(source || '').trim().toLowerCase();
  if (value === 'project-unblock') return 'unblock';
  if (value === 'meeting-review' || value.startsWith('meeting')) return 'meeting';
  if (value.startsWith('memo')) return 'memo';
  if (value === 'check-items') return 'check-items';
  return 'manual';
}

export function decisionSourceLabel(key) {
  return LABELS[key] || LABELS.manual;
}
