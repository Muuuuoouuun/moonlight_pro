// These labels describe what the stored metric counts, not a model interpretation.
const METRICS={
  contacts:['고객 연락 활동','건','기록된 실제 연락 활동 수입니다. 고유 고객 수가 아닙니다.'],
  newDeals:['새로 생성된 딜','건','기간 중 생성한 딜 수입니다. 신규 리드 수나 전체 파이프라인 규모가 아닙니다.'],
  modifiedOpenDeals:['수정된 진행 딜','건','기간 중 수정된 현재 진행 딜 수입니다. 정체된 딜 수나 단계 이동 횟수가 아닙니다.'],
  movedDeals:['기록된 딜 단계 이동','건','기간 중 기록된 단계 이동 횟수입니다. 한 딜이 여러 번 이동할 수 있습니다.'],
  wonDeals:['성사일이 확인된 딜','건','실제 성사일이 기간에 포함된 현재 성사 딜 수입니다.'],
  wonAmount:['성사 딜 계약 금액','원','성사일이 기간에 포함된 딜의 KRW 계약 금액 합계입니다. 실제 입금 금액이 아닙니다.'],
  doneTasks:['완료한 할 일','건','현재 완료 상태인 할 일을 완료 시각으로 집계합니다. 재오픈하면 과거 값도 바뀝니다.'],
  publishes:['발행한 원고','건','실제 발행 시각에 집계한 원고 수입니다. 같은 원고를 중복 기록해도 1건입니다.'],
  personalDeals:['수정된 개인 딜','건','수정한 개인 딜 수. 신규·성사 건수가 아닙니다.'],
  focusPicked:['오늘 3개로 고른 할 일','건','기간 안 오늘 3개 선택 수입니다.'],
  focusDone:['선택한 날 완료한 오늘 3개','건','선택한 날 완료한 오늘 3개 수입니다.'],
  focusRate:['오늘 3개 당일 완료율','%','오늘 3개로 고른 할 일 중 같은 날 완료한 비율입니다.'],
  focusDays:['오늘 3개를 선택한 날','일','기간 내 오늘 3개 선택 기록이 있는 날 수입니다.'],
  memos:['새로 남긴 메모','건','기간 중 새 journal note 수입니다.'],
  reviewDays:['하루 리뷰를 남긴 날','일','하루 리뷰 기록이 있는 날 수입니다.'],
};
const WORKSPACE_KEYS=new Set(['focusPicked','focusDone','focusRate','focusDays','memos']);
const measured=value=>typeof value==='number'&&Number.isFinite(value);

export function buildWeeklyMetricEvidence(report,previous,scope) {
  return Object.entries(report.stats||{}).filter(([key])=>METRICS[key]).map(([key,raw])=>{
    const [label,unit,meaning]=METRICS[key];
    const value=measured(raw)?raw:null;
    const previousValue=measured(previous?.stats?.[key])?previous.stats[key]:null;
    const currentDefinition=report.definitions?.[key];
    const previousDefinition=previous?.definitions?.[key];
    const changed=currentDefinition!==previousDefinition;
    const reason=!previous?'comparison-unavailable':changed?'definition-changed':value===null||previousValue===null?'unmeasured':previousValue===0?'zero-baseline':null;
    const comparable=previous&&value!==null&&previousValue!==null&&!changed;
    const delta=comparable?value-previousValue:null;
    return {key,label,value,unit,meaning,
      scopeNote:WORKSPACE_KEYS.has(key)?'워크스페이스 전체(회사 포함); 개인 완료와 다른 모수.':scope==='company'?'회사 기록':'개인 기록',
      sourceRefId:`weekly:stats:${key}`,
      comparison:{previous:previousValue,delta,deltaUnit:unit==='%'?'%p':unit,percentChange:comparable&&previousValue!==0?Math.round(delta/Math.abs(previousValue)*10000)/100:null,reason},
    };
  });
}
