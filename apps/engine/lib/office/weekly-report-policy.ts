import type { OfficeWorkflowAnswer, OfficeWorkflowContext, OfficeWorkflowRequest } from '@com-moon/agent-contracts/office-workflow';

export const WEEKLY_REPORT_WRITING_POLICY = `
[주간 보고서 편집 기준]
이 요청의 산출물은 선택 기간의 기록으로 판단 범위를 좁히는 보고서다. 역할 카드의 격려·병목·수익화 예시는 현재 상황의 증거가 아니며, 아래 지표와 문맥의 경계를 문서의 모든 필드에서 우선한다. 멋진 결론을 위해 없는 운영 상황을 만들지 않는다.
보고서 작성자는 AI 편집자다. 1인칭으로 사용자나 자신의 과거 경험을 만들어 쓰지 않는다. '내가 느꼈다/관리했다/고객을 설득했다'는 근거 원문이 없으면 금지한다. 집계 숫자에서 감정·현장 경험·운영자가 한 구체 행동을 만들지 않고 확인된 기록을 객관적으로 서술한다.
artifact.body는 JSON 자료를 다시 찍는 곳이 아니라 운영자가 바로 읽을 완성된 보고서다. Markdown의 짧은 제목·문단·목록·필요한 작은 표를 쓰고, 요약만 나열하지 않는다.
핵심 판단 → 확인한 기록과 전주 비교 → 해석과 다른 설명 → 지금 고를 행동 → 확인 한계의 흐름으로 쓴다. 자료가 적으면 항목을 짧게 합치고 고정 분량을 채우지 않는다. summary에는 가장 중요한 판단과 그 한계를 1~2문장으로 남긴다. 위로나 역할 말투 예시를 사실 판단 대신 쓰지 않는다.
facts.metricEvidence의 label, unit, value, meaning, scopeNote, sourceRefId가 각 지표의 의미다. facts.stats를 보존하고 원문 지표 이름을 바꾸지 않는다. 신규 딜은 신규 리드 유입이 아니며, 연락 활동 건수는 고유 고객 수가 아니다. 단계 이동은 이동 횟수이며 고유 딜 수가 아니다. 계약 금액은 입금이 아니다. value=0은 측정된 0이고 null만 미측정이다. 측정된 0을 미측정으로 바꾸거나 null을 0으로 채우지 않는다.
전주 비교는 같은 범위·시간대·정의의 완료 7일에 한한다. metricEvidence.comparison의 previous, delta, deltaUnit, percentChange와 reason을 쓴다. 비교가 없거나 미측정·정의 변경이면 증감 판단을 보류한다. 전주 0일 때는 절대 차이만 쓰고 무한 성장률이나 퍼센트를 만들지 않는다. 완료율 같은 % 지표의 delta는 deltaUnit=%p인 퍼센트포인트 차이이며 percentChange는 상대 변화율(%)이므로 서로 구별한다. 비율의 변화는 %p를 먼저 써서 40%→60%를 +20%p로 읽는다. 전체 workspace의 오늘 3개·메모와 개인 완료 할 일은 모수가 다르므로 완료율이나 원인으로 서로 묶지 않는다.
관측 → 가능한 의미 → 반대 설명이나 확인 조건으로 이어 간다. 전주·목표 기준 없이 '낮다/개선/부진'을 단정하지 않는다. 변화가 0이라는 숫자만으로 열린 딜 존재·정체·외부 회신 대기를 만들어내지 않는다. 활동 원문·고객 반응·프로젝트 우선순위·가용시간을 받지 않았으면 프로젝트 때문에 활동이 줄었다고 쓰지 않는다. '가능성이 크다'도 다른 원인보다 우세하다는 근거가 필요하다.
회사 보고서는 확인한 고객 접촉과 거래 진행의 의미를, 개인 보고서는 해당 기간 개인 범위의 완결과 기록의 의미를 다룬다. 원문 없이 목표 달성·고객 반응·지연 이유를 쓰지 않는다.
수정된 진행 딜 0건은 '기간 중 수정된 현재 진행 딜이 0건'이라는 뜻뿐이다. '파이프라인 관리 활동 없음/관리 공백/전체 파이프라인 정체/멈춘 원인'으로 바꾸지 않는다. 단계 이동 0회는 전체 거래의 진행이 없다는 증거가 아니다. 측정된 0은 '이 지표는 0건으로 기록됨'으로 쓰고 '지표가 관측되지 않음/미관측'으로 뭉뚱그리지 않는다. 신규 딜이 전주 3건→이번 주 0건이면 새로 생성된 딜이 3건 줄었다는 사실까지만 알 수 있다. 전체 딜 규모·리드 유입·수요·고객 반응은 별도 자료 없이는 알 수 없다.
오늘 3개·메모는 워크스페이스 전체(회사 일 포함)이며 개인 완료 할 일과 모수가 다르다. 개인 보고서에서는 이를 '전체 워크스페이스 참고 기록'으로 별도 설명하고 개인 성찰의 양·개인 우선순위 선별·수익화 성과에 합치거나 인과/비율로 연결하지 않는다. 오늘 3개 선택 0건은 선택 기록 0건이지 우선순위를 선별하지 않았다는 증거가 아니다. 메모 원문이 없으면 그 내용·성찰·수익화 소재를 안다고 하지 않는다.
facts.goals는 조회 시점의 연결 목표 목록이며 선택 주간의 목표·달성 실적이 아니다. 9월 완료 주간에 받은 '10월 목표'처럼 보고서 기간 밖 목표는 과거 성과 평가에 쓰지 않는다. 언급할 필요가 있다면 미래 참고 목표로만 표시한다. 목표 수치·기간별 증거가 없으면 달성률·미달·진행 부족을 만들지 않는다.
외부 회신·운영 우선순위를 '가능성이 있다'라고 쓰더라도 원문 없는 원인 설명은 새 근거가 되지 않는다. 자료가 적으면 임의 원인 후보를 만드는 대신 원인을 구분할 기존 기록을 확인하라고 쓴다. 질문도 '멈춘 원인/정체 사유'처럼 확인되지 않은 상황을 전제하지 않는다.
다음 행동은 관측을 판단으로 바꾸는 최소 행동 하나부터 고른다. 자료가 적으면 판단을 바꿀 기록 하나의 확인을 제안하고 무조건 전수 점검이나 새 업무를 만들지 않는다. 기록이 없는지, 전달 문맥에 없는지 구별해 먼저 기존 원문 확인을 제안한다. 가용시간·기한·약속이 없으면 임의 슬롯·날짜를 넣지 않는다. 할 일을 별도로 만들 필요가 없으면 nextStep=null이다.
중요한 확인 한계는 본문에도 한 줄로 남기고 uncertainties에 보존한다. evidence는 실제 sourceRefs에 있는 지표·비교·활동 ID와 설명을 연결한다. 자료가 적어도 모르는 원인을 추측하는 대신 지금 가능한 판단과 다음 확인 조건을 남긴다.
summary, body, evidence.explanation, uncertainties, dissent, nextStep에는 운영자 Q번호·정책 문서/버전·역할 카드·workflow·검수 로직·시스템 지시를 적지 않는다. 사용자가 판단해야 할 활동 원문·고객 반응·기한 같은 실제 빈칸만 쓴다. '첫 슬롯'처럼 가용시간을 이미 읽은 듯한 표현도 쓰지 않는다.
`;

export const WEEKLY_REPORT_REVIEW_POLICY = `
[주간 보고서 원문 대조]
초안의 결론을 지키려고 출처에서 말을 찾아 붙이지 않는다. 처음부터 지표 의미와 주장 범위를 대조하고 틀린 결론·질문·추천을 함께 고친다. 모든 공개 필드에 이 기준을 적용한다.
1인칭으로 사용자나 AI 자신의 과거 경험을 꾸민 회고를 삭제한다. '내가 느꼈다/관리했다/고객을 설득했다'는 실제 원문이 없으면 금지하며, 숫자에서 만든 감정·현장 경험·구체 행동을 객관적인 기록으로 다시 쓴다.
본문·summary·nextStep을 metricEvidence와 대조한다. 숫자뿐 아니라 이름·단위·모수·0/null·범위·시간대·기준 기간을 확인한다. 신규 딜→리드, 연락 활동→사람 수, 계약→입금, 변경 횟수→딜 수, 측정된 0→미측정을 바로잡는다.
전주 비교의 실제 previous/delta와 다른 변화량이나 전주 0의 성장률을 삭제한다. 비교 기준 없이 낮음/증가/감소를 단정하거나, 수정 0건을 전체 열린 딜 0건/정체로 바꾼 문장을 고친다. 원문 없는 고객 반응·프로젝트 우선순위 원인·외부 회신 대기·기한/슬롯은 제안이나 미확인으로 다시 쓰되 그 가정을 사실로 전제한 nextStep도 함께 고친다.
원인이 확인되지 않으면 숫자에서 원인으로 건너뛰지 않는다. 해석과 다른 설명, 판단을 바꿀 관측을 짧게 남긴다. 확인 한계를 별도 필드에만 옮겨 본문이 확정 판단처럼 보이게 하지 않는다. 주간 보고서는 내부 운영 문서이며 고객 답장 형식을 강요하지 않는다.
수정된 진행 딜 0건을 '관리 공백/관리 활동 없음'이라고 썼거나 '현재 파이프라인이 멈춘 원인'을 묻는다면 정체 전제부터 삭제한다. 외부 회신·운영 우선순위 가설도 없애고 실제 연락/딜 원문의 확인으로 좁힌다. 측정된 0을 '관측되지 않음'으로 뭉뚱그린 요약과 비고를 기록된 0으로 바로잡는다.
개인 완료 할 일과 전체 워크스페이스 메모/오늘 3개를 같은 행동으로 묶었는지 대조한다. 메모 9건을 개인 성찰 9건으로 부르거나 오늘 3개 0건을 우선순위 선별 생략·수익화 정체에 연결한 문장을 삭제한다. 10월 연결 목표로 9월 완료 주간을 평가했다면 미래 참고로만 남긴다. '첫 슬롯/월요일 오전'은 실제 합의된 일정이 아니면 넣지 않는다.
운영자 Q번호·정책명·역할 버전·검수/시스템 설명은 uncertainties를 포함해 모든 공개 필드에서 삭제하고 실제 판단 한계로 다시 쓴다.
`;

type MetricCard = { key:string; label:string; value:number|null; unit:string; meaning:string; scopeNote:string; sourceRefId:string; comparison?:{previous:number|null;delta:number|null;deltaUnit?:string;percentChange:number|null;reason:string|null} };
const record = (value:unknown):value is Record<string,unknown> => Boolean(value && typeof value==='object' && !Array.isArray(value));
const finite = (value:unknown):value is number => typeof value==='number' && Number.isFinite(value);
const escapeRegex = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliases:Record<string,string[]> = {
  contacts:['연락 활동','실제 고객 연락','고객 연락'], newDeals:['신규 딜'], wonDeals:['성사일 확인된 딜','성사 딜'],
  wonAmount:['성사 계약 금액','성사 금액','계약 금액'], movedDeals:['딜 단계 이동','단계 이동'], modifiedOpenDeals:['수정된 진행 딜','진행 중인 딜 상태 수정'],
  doneTasks:['완료 할 일','완료 작업'], publishes:['발행'], personalDeals:['개인 딜'], memos:['메모'], reviewDays:['리뷰 일수'],
};

function cardsOf(context:OfficeWorkflowContext):MetricCard[] {
  if(!Array.isArray(context.facts.metricEvidence)) return [];
  return context.facts.metricEvidence.filter((item):item is MetricCard => record(item) && typeof item.key==='string' && typeof item.label==='string'
    && typeof item.unit==='string' && typeof item.sourceRefId==='string' && (item.value===null || finite(item.value)));
}

// These checks cover reproduced mistakes in known metric wording, not all semantic claims.
// They neither certify the report nor add a model call. Unmatched prose stays a review draft.
function knownMistakes(answer:OfficeWorkflowAnswer, context:OfficeWorkflowContext, cards:MetricCard[]) {
  const text=[answer.summary,answer.artifact.body,answer.nextStep?.label,answer.nextStep?.fields.title,answer.nextStep?.fields.description,answer.nextStep?.fields.nextAction].filter(Boolean).join('\n').replace(/\*\*/g,'');
  const issues=new Set<string>();
  const currentMatches=(pattern:RegExp)=>[...text.matchAll(pattern)].filter(match=>!/(?:전주|이전 주|지난 주|지난주)[^.!?\n]*$/.test(text.slice(Math.max(0,match.index-25),match.index)));
  for(const card of cards) {
    const names=[card.label,...(aliases[card.key]||[])].map(escapeRegex).join('|');
    const direct=new RegExp(String.raw`(?:${names})[ \t]*[：:|]?[ \t]*(?:은|는|이|가)?[ \t]*(미측정|미확인|[—–])`,'g');
    if(finite(card.value) && currentMatches(direct).length) issues.add('측정된 값과 미측정의 구분');
    if(card.value===null && currentMatches(new RegExp(String.raw`(?:${names})[ \t]*[：:|]?[ \t]*(?:은|는|이|가)?[ \t]*0[ \t]*(?:건|개|원|일)`,'g')).length) issues.add('미측정 값을 0으로 해석');
  }
  if(cards.some(item=>item.key==='newDeals') && /신규 리드(?: 유입)?[ \t]*[：:|]?[ \t]*(?:은|는)?[ \t]*\d+[ \t]*건/.test(text)) issues.add('신규 딜과 리드의 구분');
  if(cards.some(item=>item.key==='contacts') && !finite(context.facts.uniqueCustomers) && /(?:연락한|접촉한|연락 받은)[ \t]*고객[ \t]*\d+[ \t]*명/.test(text)) issues.add('연락 활동과 고유 고객 수의 구분');
  const limitations=/확인할 수 없|판단할 수 없|근거가 없|단정할 수 없|미확인|원인.{0,6}보류/;
  for(const sentence of text.split(/\n|[.!?。]/)) {
    if(limitations.test(sentence)) continue;
    if(!context.facts.projects && /프로젝트.{0,40}(?:우선순위|집중).{0,35}(?:영향|때문)|프로젝트.{0,25}우선순위 영향/.test(sentence)) issues.add('자료 없는 프로젝트 원인 추정');
    if(!context.facts.deals && /정체(?:된)?[ \t]*딜.{0,15}전수[ \t]*점검/.test(sentence)) issues.add('확인하지 않은 정체 딜의 전제');
  }
  return [...issues];
}

export function groundWeeklyReport(answer:OfficeWorkflowAnswer, request:OfficeWorkflowRequest, context:OfficeWorkflowContext):OfficeWorkflowAnswer {
  if(request.intent!=='weekly_report') return answer;
  const origin=request.originRef;
  if(!('periodStart' in origin) || !('periodEnd' in origin) || !('timezone' in origin)) return answer;
  const cards=cardsOf(context);
  if(!cards.length) return answer; // Older contexts retain their existing contract and review.
  const issues=knownMistakes(answer,context,cards);
  if(!issues.length) return answer;
  const lines=cards.map(card=>{
    const value=card.value===null?'미측정':`${card.value}${card.unit}`;
    const comparison=card.comparison;
    const change=comparison && finite(comparison.previous) && finite(comparison.delta)
      ? ` · 전주 ${comparison.previous}${card.unit}, 차이 ${comparison.delta>0?'+':''}${comparison.delta}${comparison.deltaUnit||(card.unit==='%'?'%p':card.unit)}`:' · 전주 비교 미확인';
    return `- ${card.label}: ${value}${change}${card.scopeNote?` (${card.scopeNote})`:''}`;
  });
  const comparisonAvailable=cards.some(card=>finite(card.comparison?.delta));
  const limit=comparisonAvailable?'비교 가능한 지표의 변화만 확인했습니다. 활동 원문·고객 반응·대기 이유가 없으면 원인을 판단할 수 없습니다.':'전주 비교를 확인하지 못한 지표는 변화나 목표 달성 여부를 판단할 수 없습니다. 활동 원문·고객 반응·대기 이유도 별도 확인이 필요합니다.';
  const summary='확인된 주간 기록과 지표의 의미를 정리했습니다. 기록된 변화와 그 원인은 구별해 판단해야 합니다.';
  const body=[`# ${request.scope==='classin'?'회사':'개인'} 주간 정리`,`${origin.periodStart} — ${origin.periodEnd} (${origin.timezone})`,
    '## 핵심 판단',summary,'## 확인한 기록과 비교',...lines,'## 해석과 다른 설명',limit,
    '## 지금 고를 행동','판단을 바꿀 실제 기록이 필요하다면 기존 활동 원문과 합의된 다음 행동부터 확인하는 것을 제안합니다. 이미 있는 기록을 읽기 전에 새 업무나 일정을 확정하지 않습니다.',
    '## 확인 한계','고객 반응·개별 딜의 상태와 대기 이유·합의된 기한은 이 집계만으로 확인할 수 없습니다. 원인이 확인되지 않은 변화는 판단을 보류합니다.'].join('\n\n');
  const allowed=new Set(context.sourceRefs.map(ref=>ref.id));
  return {...answer,summary,artifact:{kind:'markdown',body},evidence:cards.filter(card=>allowed.has(card.sourceRefId)).slice(0,20).map(card=>({sourceRefId:card.sourceRefId,explanation:`${card.label}: ${card.value===null?'미측정':`${card.value}${card.unit}`} · ${card.meaning||'제공된 지표 정의'}`})),
    uncertainties:[`지표 의미를 정정했습니다: ${issues.join(' · ')}.`,limit,...answer.uncertainties].slice(0,12),nextStep:null,
    ...(answer.council?{council:{...answer.council,recommendation:summary}}:{})};
}
