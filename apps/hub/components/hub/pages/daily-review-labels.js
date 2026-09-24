// 하루 리뷰 라벨 — 페이지·팝업·코칭·cue가 같은 어휘를 쓴다.
export const ENERGY_LABELS = ['많이 지침', '조금 지침', '보통', '여유 있음', '활기참'];
export const PROGRESS = [{ key: 0, label: '미착수' }, { key: 1, label: '진행' }, { key: 2, label: '목표 달성' }];

export function progressLabel(value) {
  return value === 'not_applicable' ? '대상 없음' : PROGRESS.find((item) => item.key === value)?.label || '미입력';
}

export function energyText(energy) {
  return Number.isInteger(energy) && energy >= 1 && energy <= 5 ? `에너지 ${energy} · ${ENERGY_LABELS[energy - 1]}` : '에너지 미입력';
}
