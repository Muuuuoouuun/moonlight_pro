'use client';

import { OFFICE_DELIBERATION_PROFILES, OFFICE_ROSTER } from '@com-moon/agent-contracts/office';
import { SegmentedControl, SelectField } from './hub-primitives';
import { officeDeliberationForParticipants, officeDiscussionState } from './office-deliberation-client';
import styles from './office-deliberation-controls.module.css';

const AXES = [
  { key: 'challenge', label: '반론 강도', hint: '다른 관점의 전제와 빠진 조건을 얼마나 적극적으로 짚을지 정합니다.', levels: ['없음', '약함', '보통', '강함'] },
  { key: 'depth', label: '검토 깊이', hint: '핵심 판단부터 대안과 조건까지 살펴볼 깊이를 정합니다.', levels: [null, '간단', '보통', '깊게'] },
  { key: 'warmth', label: '대화 온도', hint: '표현의 온도를 정합니다. 사실과 위험 판단은 바꾸지 않습니다.', levels: ['담백', '차분', '다정', '따뜻'] },
  { key: 'convergence', label: '결론 수렴', hint: '선택지를 열어 둘지, 지금의 추천을 분명히 할지 정합니다.', levels: ['유보', '낮음', '보통', '높음'] },
];
const WEIGHTS = [{ key: 1, label: '기본' }, { key: 2, label: '중점' }, { key: 3, label: '우선' }];
const personName = id => OFFICE_ROSTER.find(person => person.id === id)?.name || id;

export function OfficeDeliberationControls({ value, participants, onChange, disabled = false }) {
  const settings = officeDeliberationForParticipants(value, participants);
  return <details className={styles.controls}>
    <summary>고급 · 검토 방식 조절</summary>
    <fieldset disabled={disabled} className={styles.fields}>
      <SelectField label="회의 상황" value={settings.profile}
        options={Object.entries(OFFICE_DELIBERATION_PROFILES).map(([key, profile]) => ({ value: key, label: profile.label }))}
        onChange={event => onChange(officeDeliberationForParticipants({ profile: event.target.value, influence: settings.influence }, participants))} />
      <div className={styles.axes}>{AXES.map(axis => <div className={styles.axis} key={axis.key}>
        <div className={styles.label}><strong>{axis.label}</strong><span className="mono">{settings[axis.key]} / 3</span></div>
        <SegmentedControl label={axis.label} fill value={settings[axis.key]}
          options={axis.levels.flatMap((label, key) => label ? [{ key, label }] : [])}
          onChange={level => onChange({ ...settings, [axis.key]: level })} />
        <p className={styles.note}>{axis.hint}</p>
      </div>)}</div>
      <div className={styles.weights}>
        <strong className={styles.heading}>참가 관점의 비중</strong>
        {participants.map(id => <div className={styles.weight} key={id}>
          <span>{personName(id)}</span>
          <SegmentedControl label={`${personName(id)} 관점 비중`} options={WEIGHTS} value={settings.influence[id]} fill
            onChange={weight => onChange({ ...settings, influence: { ...settings.influence, [id]: weight } })} />
        </div>)}
        <p className={styles.note}>비중은 종합할 때 먼저 고려할 관점을 정합니다. 사실과 위험은 다수결이나 비중으로 바꾸지 않습니다.</p>
      </div>
      <p className={styles.note}>같은 모델의 역할별 개별 검토입니다. 서로 다른 모델이나 외부 전문가의 검증은 아닙니다.</p>
    </fieldset>
  </details>;
}

export function OfficeDiscussion({ result, request }) {
  const { state, discussion } = officeDiscussionState(result, request);
  if (state === 'none') return null;
  if (state === 'legacy') return <p className={styles.note}>이전 관점 시뮬레이션 · 역할별 발언 기록 없음</p>;
  if (state === 'invalid') return <p className={styles.note} role="status">토론 기록 확인 필요 · 역할별 기록을 확인하지 못했습니다.</p>;
  return <details className={styles.discussion}>
    <summary>역할별 검토 기록 · {discussion.turns.length}개 발언</summary>
    <div className={styles.record}>
      <p className={styles.note}>같은 모델의 역할별 개별 검토 · 모델 호출 <span className="mono">{discussion.modelCalls}</span>회</p>
      <dl className={styles.settings}>
        <div><dt>상황</dt><dd>{OFFICE_DELIBERATION_PROFILES[discussion.settings.profile].label}</dd></div>
        {AXES.map(axis => <div key={axis.key}><dt>{axis.label}</dt><dd>{axis.levels[discussion.settings[axis.key]]}</dd></div>)}
        <div><dt>관점 비중</dt><dd>{Object.entries(discussion.settings.influence).map(([id, weight]) => `${personName(id)} ${WEIGHTS[weight - 1].label}`).join(' · ')}</dd></div>
      </dl>
      <ol className={styles.turns}>{discussion.turns.map((turn, index) => <li key={`${turn.ownerId}-${turn.round}`}>
        <div className={styles.turnHeader}><strong>{personName(turn.ownerId)}</strong><span>{turn.round === 'position' ? '첫 의견' : '상호 검토'}{turn.round === 'response' ? ` · ${turn.changed ? '관점 수정' : '판단 유지'}` : ''}</span><span className="mono">{index + 1}</span></div>
        <p>{turn.position}</p>
        <dl className={styles.turnDetails}>
          <div><dt>근거</dt><dd>{turn.evidence.length ? turn.evidence.join('\n') : '제공된 근거 없음'}</dd></div>
          <div><dt>반론</dt><dd>{turn.objection || '기록된 반론 없음'}</dd></div>
          <div><dt>판단을 바꿀 조건</dt><dd>{turn.revisionCondition}</dd></div>
          {turn.round === 'response' ? <><div><dt>답한 관점</dt><dd>{turn.replyTo.map(personName).join(' · ')}</dd></div><div><dt>{turn.changed ? '수정 이유' : '유지 이유'}</dt><dd>{turn.changeReason}</dd></div></> : null}
        </dl>
      </li>)}</ol>
    </div>
  </details>;
}
