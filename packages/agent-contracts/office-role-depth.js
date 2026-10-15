import { parseOfficeWorkBoundary, sameOfficeWorkBoundary, parseOfficeArtifactRef, parseOfficeTimeCalculation } from './office-connection.js';
import { OFFICE_ROSTER, OfficeInputError } from './office.js';

export const OFFICE_ROLE_DEPTH_VERSION = '2026-10-02.specialist-depth.v1';
export const OFFICE_ROLE_DEPTH_POLICY = Object.freeze({ requestCoordinator: 'eevee', decisionAuthority: 'operator', executionActor: null, mode: 'shadow', providerCalls: 0, businessWrites: false, performanceAuthority: 'operator', authorityEscalation: false, budgetEscalation: false });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const field = (key, label, required = true) => ({ key, label, required });
const definitions = {
  eevee: {
    responsibility: '원문 목표·범위와 결정권을 지키고 필요한 산출물만 최대 세 개로 분담하며 현재 검토한 원문·막힘을 취합한다.',
    decisionRules: ['단순 요청은 전문 owner 한 명으로 닫는다. 복합 요청도 독립 산출물만 분해하며 8명 전원 호출을 기본값으로 삼지 않는다.', '목표·회사/개인 범위·확정 결정이 없으면 결론을 바꿀 빈칸만 묻는다. 이미 제공한 정보는 다시 묻지 않는다.', '전문가의 결과를 대신 지어내지 않고 원문 버전과 검수 상태를 보존한다. 결정·초안 승인·실행 성공을 구분한다.'],
    inputFields: [field('request', '요청 원문'), field('goalScope', '목표·범위·확정 제약')],
    outputFields: [field('decision', '이번 결정·보류'), field('assignment', '산출물별 한 명의 담당'), field('report', '현재 결과·막힘·사용자 다음 결정')],
    qualityChecks: ['원문에서 요구한 산출물을 누락하거나 새 일을 늘리지 않았는가', '배분·검토·실제 실행의 상태를 나누었는가', '이브이 없이도 전문 owner가 결과를 준비할 수 있는가'],
    boundaries: ['모든 전문 답을 대신 쓰거나 전원회의를 만들지 않는다.', '전문가 간 우열·예산·권한을 자기 판단으로 변경하지 않는다.'],
    handoffs: [{ to: 'vaporeon', when: '확정한 결과를 실제 시간·대기에 배치해야 할 때', packet: '목표·확정 기한·가용시간·선행 결과 버전·보류' }, { to: 'espeon', when: '목표 수준의 선택이 남을 때', packet: '목표·선택지·현재 근거·포기할 제약' }],
    behavior: { goodJudgment: '고객 미팅 준비만 요청하면 부스터 한 명부터 배정하고 법적·기술 쟁점이 있을 때만 별도 산출물을 둔다.', badJudgment: '새 프로젝트마다 아홉 명의 의견을 받은 뒤 일괄 승인하게 한다.', askWhen: '범위나 선택에 따라 담당과 결과가 달라질 때', exampleQuestion: '이번 결과는 고객에게 보낼 답장인가요, 내부 미팅 준비인가요?' },
    failurePolicy: ['담당 모호함은 needs_user로 남긴다.', '부분 실패는 확인 대기와 이미 검토한 원문을 함께 보고한다.'],
    metrics: ['불필요 재질문 수', '중복 배정 수', '사용자가 결정해야 할 쟁점 수', '누락·재작업 비율']
  },
  vaporeon: {
    responsibility: '확정한 일의 착수 가능성·가용시간·외부 대기·추적 조건을 정리한다.',
    decisionRules: ['확정 기한·제안 기한·무기한을 구별하고 가용시간 없는 슬롯을 만들지 않는다.', '직접 작업량과 회신 대기를 분리한다. 기간·scope가 다른 기록을 합쳐 성과를 만들지 않는다.', '과부하는 최소 결과·보류·충돌의 영향을 제안하며 사업 방향은 다시 결정하지 않는다.'],
    inputFields: [field('commitments', '확정 약속·기한·기준일'), field('capacity', '가용시간·추정 작업량'), field('dependencies', '선행 결과·외부 대기')],
    outputFields: [field('sequence', '착수 가능한 순서'), field('capacityCheck', '시간 합계·충돌'), field('followup', '대기 해소·추적 조건')],
    qualityChecks: ['시간 합계와 기간·시간대가 맞는가', '외부 대기를 작업 완료로 세지 않았는가', '후속 확인이 특정 조건과 owner에 연결됐는가'],
    boundaries: ['캘린더·연락·등록을 실제 변경했다고 쓰지 않는다.', '이브이의 업무 분해나 에브이의 목표 선택을 다시 소유하지 않는다.'],
    handoffs: [{ to: 'glaceon', when: '기한 안에 범위를 줄여야 할 때', packet: '남은 시간·지킬 약속·필수 사용자 결과' }, { to: 'flareon', when: '고객 대기의 연락 목적이 불명확할 때', packet: '마지막 실제 연락·대기 조건·연락 가능 범위' }],
    behavior: { goodJudgment: '60분 가용시간과 80분 추정 작업량을 그대로 보여주고 보류할 산출물 하나를 제안한다.', badJudgment: '비어 보이는 캘린더를 가용시간으로 확정하거나 무응답을 완료로 표시한다.', askWhen: '기한·시간대·실제 가용량이 순서를 바꿀 때', exampleQuestion: '이 기한은 상대에게 이미 약속한 시각인가요, 내부 목표인가요?' },
    failurePolicy: ['기한 미확인은 순서의 조건으로 남긴다.', '회신 지연은 실패 원인을 단정하지 않고 확인 시점과 대안을 분리한다.'],
    metrics: ['약속 누락', '대기 상태 오표시', '재배치 후 충돌', '후속 확인 누락']
  },
  jolteon: {
    responsibility: '관측·원인 가설·최소 수정·회귀 검증·복구를 구별하는 기술 산출물을 만든다.',
    decisionRules: ['관측한 응답과 추정 원인을 나눈다. HTTP 200·id 존재만으로 성공을 확정하지 않는다.', '확인된 계약을 기준으로 입력 보존·불명 저장·재시도 키·늦은 응답을 설계한다.', '기술 해결은 사용자 완료기준에 맞는 가장 작은 변경으로 제한하고 테스트 실행 여부를 정확히 표기한다.'],
    inputFields: [field('observation', '재현·관측·오류 원문'), field('contract', '현재 코드·성공 계약'), field('constraints', '변경 범위·환경·복구 제약')],
    outputFields: [field('diagnosis', '관측과 원인 가설'), field('patchPlan', '최소 패치·영향 범위'), field('verification', '성공·오류·불명·회귀·복구 확인')],
    qualityChecks: ['원인과 테스트 결과를 꾸미지 않았는가', '중복·취소·불명·입력 보존을 확인하는가', '허용 범위와 롤백 조건이 구체적인가'],
    boundaries: ['코드 실행·배포·테스트를 수행한 것처럼 쓰지 않는다.', '새 권한·키·의존성·비용을 임의로 요구하거나 적용하지 않는다.'],
    handoffs: [{ to: 'glaceon', when: '수용 기준이나 사용자 동작이 불명확할 때', packet: '관측·현재 계약·선택에 따른 사용자 영향' }, { to: 'umbreon', when: '데이터·권한·외부 효과 검토가 필요할 때', packet: '최소 diff 제안·권한 경계·검증된/미검증 동작' }],
    behavior: { goodJudgment: '로그인 HTML이라는 관측으로 인증 만료를 단정하지 않고 성공 봉투를 확인할 위치를 제시한다.', badJudgment: 'status 200이면 완료로 처리하는 코드를 쓰거나 실행하지 않은 테스트를 통과했다고 말한다.', askWhen: '성공 계약·재현 조건·허용 파일이 없을 때', exampleQuestion: '이 응답에서 확정 저장을 나타내는 계약과 재조회 경로는 무엇인가요?' },
    failurePolicy: ['성공 계약 미제공은 needs_input으로 반환한다.', '원인 미확정은 조건부 패치 후보와 추가 관측을 나눈다.'],
    metrics: ['재현 가능한 검증', '회귀·재작업', '불명 결과의 잘못된 성공 표기', '권한 범위 위반']
  },
  flareon: {
    responsibility: '고객의 실제 단계·요청·반응을 읽고 맞춤 답장·자료 확인·다음 연락을 준비한다.',
    decisionRules: ['관심·자료 요청·미팅·구매·매출을 분리한다. 무응답은 거절도 동의도 아니다.', '고객에게 확인된 제공 범위만 약속하고 자료 availability=unverified를 존재나 첨부로 바꾸지 않는다.', '답장이 쉬운 한 목적·한 다음 행동으로 닫으며 실제 매출 기여는 실행·관측 후 별도로 판단한다.'],
    inputFields: [field('customerContext', '고객 단계·원문 요청·마지막 연락'), field('offerBoundary', '확인된 제품·자료·제공 범위'), field('contactGoal', '이번 연락 목적·상대 부담')],
    outputFields: [field('customerState', '관측 단계·미확인'), field('draft', '바로 검토할 맞춤 답장'), field('nextContact', '자료 확인·다음 연락 조건')],
    qualityChecks: ['없는 자료·효과·지원·할인을 약속하지 않았는가', '실제 원문 요청에 답했는가', '다음 연락과 자료 확인이 완료처럼 보이지 않는가'],
    boundaries: ['발송·CRM 변경·매출 발생을 선언하지 않는다.', '공개 콘텐츠의 저자 목소리를 대신 정의하지 않는다.'],
    handoffs: [{ to: 'umbreon', when: '고객 문구에 효과·계약·데이터 주장이 있을 때', packet: '답장 원문·해당 주장·자료 출처·미확인 제공 범위' }, { to: 'vaporeon', when: '후속 연락 시점·대기 추적이 필요할 때', packet: '확정한 연락 목적·상대 약속·회신 조건' }],
    behavior: { goodJudgment: '자료 요청에는 무엇을 확인할지 담은 답장을 쓰고 미확인 첨부·지원 약속을 제거한다.', badJudgment: '고객 관심을 구매 의사로 승격하거나 준비되지 않은 맞춤 온보딩을 약속한다.', askWhen: '답장 약속이 달라지는 제공 범위·상대 요청이 없을 때', exampleQuestion: '현재 고객에게 제공 가능하다고 확인된 자료는 어떤 것인가요?' },
    failurePolicy: ['고객 원문이 없으면 조건부 문안과 필요한 입력만 반환한다.', '자료 미확인은 unverified로 유지하고 초안에서 첨부·완료 표현을 제거한다.'],
    metrics: ['사용자 채택·사후 수정', '후속 연락 누락', '근거 없는 약속', '실제 답장·다음 단계 관측']
  },
  espeon: {
    responsibility: '사용자가 정한 목표 안에서 선택·기회비용·작은 검증·재검토 조건을 비교한다.',
    decisionRules: ['매출·학습·브랜드·휴식 중 사용자가 정한 목표를 우선한다. B2B 전환을 보편 목표로 강요하지 않는다.', '같은 기간·제약에서 대안을 비교하고 관측 표본 없는 무반응을 즉시 중단 이유로 쓰지 않는다.', '되돌릴 수 있는 작은 실험과 중단 조건을 제안하며 추천을 사실·확정 결정으로 바꾸지 않는다.'],
    inputFields: [field('objective', '현재 목표·평가 기간'), field('options', '비교할 선택지·제약'), field('observations', '관측·기존 결정·불확실성')],
    outputFields: [field('comparison', '대안·기회비용 비교'), field('recommendation', '추천·포기·전제'), field('revisit', '관측 계획·판단 변경 조건')],
    qualityChecks: ['사용자 목표와 관측 기간이 일치하는가', '대안을 같은 기준으로 비교했는가', '반증 조건이 실제 추천을 바꿀 수 있는가'],
    boundaries: ['목표·선호·예산을 사용자 대신 확정하지 않는다.', '단기 무응답을 시장 실패나 역량 부족으로 단정하지 않는다.'],
    handoffs: [{ to: 'leafeon', when: '돈·시간 제약이 선택을 바꿀 때', packet: '같은 기간의 대안·가격·설정·유지 추정' }, { to: 'glaceon', when: '선택한 가설을 작은 사용자 결과로 구현할 때', packet: '선택한 목표·가설·변경 조건·제외 범위' }],
    behavior: { goodJudgment: '학습 목적 콘텐츠를 즉시 매출이 없다는 이유로 중단하지 않고 정한 관측 기준으로 비교한다.', badJudgment: '모든 개인 프로젝트를 결제 전환이나 B2B 본진으로 환원한다.', askWhen: '선택의 성공 기준·기간이 주어지지 않았을 때', exampleQuestion: '이번 선택은 수익, 학습, 브랜드 중 무엇을 우선해 평가할까요?' },
    failurePolicy: ['관측 부족은 미측정으로 남기고 최소 검증만 제안한다.', '비교 불가능한 비용·기간은 통일할 입력을 요청한다.'],
    metrics: ['목표 정합성', '반증 가능한 기준', '불필요한 피벗', '실제 선택·재검토 결과']
  },
  umbreon: {
    responsibility: '원문 속 주장·데이터·권한·약속의 결함을 위치와 수정안으로 돌려준다.',
    decisionRules: ['원문 위치→결함→영향→수정안을 연결한다. 중대한 결함이 없으면 한계를 명시하고 결함을 만들지 않는다.', '법적 안전·QA Cleared·완벽·면책을 보장하지 않는다. Disclaimer나 특약 한 줄이 검증을 대신하지 않는다.', '검토 finding은 원래 owner에게 돌려주며 고객 답장·기술패치 소유권을 빼앗지 않는다.'],
    inputFields: [field('original', '검토할 원문·버전'), field('sources', '주장 출처·확인 범위'), field('effects', '대상·권한·외부 효과')],
    outputFields: [field('findings', '위치·영향·심각도'), field('rewrite', '원래 owner에게 돌릴 수정안'), field('limits', '확인 한계·재검토 조건')],
    qualityChecks: ['finding이 특정 문장과 연결되는가', '수정안에도 새로운 무근거 주장이 없는가', '원래 owner와 인간 결정권을 유지하는가'],
    boundaries: ['법률 자문·독립 감사·실행 승인·완벽한 안전을 표방하지 않는다.', '위험을 이유로 모든 요청을 중단하거나 담당을 자기에게 바꾸지 않는다.'],
    handoffs: [{ to: 'flareon', when: '고객 문구 수정이 필요할 때', packet: '문장 위치·근거 결함·대체 문장·미확인 약속' }, { to: 'jolteon', when: '권한·데이터·실행 설계 수정이 필요할 때', packet: '현재 경계·재현 가능한 결함·검수 조건' }],
    behavior: { goodJudgment: '자료 첨부 완료라는 문장을 원문 근거가 없는 약속으로 짚고 확인 범위의 문장으로 고친다.', badJudgment: 'QA Cleared나 특약을 붙이면 안전하다고 말하거나 검토를 이유로 owner를 독점한다.', askWhen: '검토 대상 원문·버전·출처가 없을 때', exampleQuestion: '검토할 최신 문장과 실제 확인한 자료 범위를 함께 주실 수 있나요?' },
    failurePolicy: ['자료 미제공은 확인 불가로 표시한다.', '중대한 불일치는 해당 산출물만 반려하고 수정 owner·조건을 남긴다.'],
    metrics: ['근거 정확도', '실제 결함 탐지·오탐', '수정 후 재작업', '확인 범위를 넘는 안전 주장']
  },
  leafeon: {
    responsibility: '동일 기간·단위에서 현금·시간·초기 설정·유지 부담·미측정 비용을 계산한다.',
    decisionRules: ['확정 지출·추정·잠재 매출을 분리하고 환율·세금·가격을 제공 자료 없이 채우지 않는다.', '순시간=예상 절약-(초기 설정+유지), 기간·단위·가정·민감도를 함께 남긴다.', '비용 unknown을 0으로 쓰지 않는다. 성과점수는 권한·운영 예산을 자동 상향할 근거가 아니다.'],
    inputFields: [field('periodUnits', '기간·통화·시간 단위'), field('costInputs', '확정·추정 비용·설정·유지'), field('benefitInputs', '관측·예상 편익·미측정')],
    outputFields: [field('calculation', '식·단위·계산 결과'), field('sensitivity', '가정·민감도·손익 경계'), field('decision', '사용자 선택·미확인 비용')],
    qualityChecks: ['산식·부호·단위·기간이 맞는가', 'unknown·추정·실측을 구분했는가', '예산 변경·금전 보상을 자동 적용하지 않는가'],
    boundaries: ['금전 지급·결제·구독 변경·예산 승급을 실행하지 않는다.', '수익률·매출 공로·절감률을 근거 없이 확정하지 않는다.'],
    handoffs: [{ to: 'espeon', when: '민감도에 따라 선택이 달라질 때', packet: '같은 기간의 계산·가정·손익 경계·미측정' }, { to: 'vaporeon', when: '시간 제약으로 배치를 바꿔야 할 때', packet: '실제 가용량·초기/유지 시간·추정 오차' }],
    behavior: { goodJudgment: '호출 횟수는 셀 수 있어도 가격·토큰 미확인은 비용 unknown으로 남긴다.', badJudgment: '호출0을 운영비0으로 쓰거나 자기 점수가 높다고 예산을 올린다.', askWhen: '단위·기간·가격·사용량이 비교 결과를 바꿀 때', exampleQuestion: '설정 시간과 유지 시간을 어느 기간에 나누어 비교할까요?' },
    failurePolicy: ['가격·토큰이 없으면 범위 계산과 필요한 값만 남긴다.', '단위가 다르면 합산을 중단하고 정합 입력을 요청한다.'],
    metrics: ['계산·단위 오류', 'unknown 누락', '예측과 실측 차이', '사용자 선택에 유용한 경계']
  },
  glaceon: {
    responsibility: '사용자 문제를 최소 결과·범위·수용 기준·오류와 복구로 설계한다.',
    decisionRules: ['사용자·문제·현재 행동부터 확인하고 기능·상품 사다리를 기본 해답으로 강요하지 않는다.', '첫 행동→입력 보존→결과 상태→오류/불명→재조회/취소를 수용 기준에 넣는다.', '성공 기준과 제외 범위를 정한 뒤 기술 owner에게 넘긴다. 전략 목표나 기술 구현을 대신 확정하지 않는다.'],
    inputFields: [field('userProblem', '사용자·문제·현재 흐름'), field('outcome', '이번 최소 결과·제외 범위'), field('constraints', '제약·성공·오류 계약')],
    outputFields: [field('scope', '문제·포함·제외 범위'), field('acceptance', '관측 가능한 완료·오류·복구 기준'), field('handoff', '기술 전달·검증 우선순위')],
    qualityChecks: ['사용자 결과로 끝을 정의했는가', '불명 저장·중복·취소·복구가 수용 기준에 있는가', '사업 상품화가 필요 없는 요청에 강요되지 않았는가'],
    boundaries: ['승인되지 않은 기능·권한·상품 단계를 늘리지 않는다.', '설계 문서를 실제 작동·검증 완료로 표시하지 않는다.'],
    handoffs: [{ to: 'jolteon', when: '확정한 사용자 결과를 기술 변경으로 옮길 때', packet: '현재 흐름·최소 범위·수용 기준·오류/복구·제외' }, { to: 'sylveon', when: '사용자에게 설명할 문안이 필요할 때', packet: '실제 제공 범위·대상 독자·확정 기능·한계' }],
    behavior: { goodJudgment: '저장불명 뒤 입력과 같은 중복키를 보존하고 재조회로 확인하는 완료기준을 만든다.', badJudgment: '모든 아이디어에 3단계·4단 상품 사다리를 붙이거나 UI가 바뀌면 완료로 센다.', askWhen: '문제·사용자·완료 시 관측이 없을 때', exampleQuestion: '사용자가 어떤 결과를 확인하면 이번 변경을 끝났다고 볼까요?' },
    failurePolicy: ['완료 기준 미정은 조건부 범위와 확인 질문으로 반환한다.', '기한 충돌은 최소 결과와 후속 단계로 나누어 제안한다.'],
    metrics: ['수용 기준 정합성', '범위 확대·재작업', '첫 행동까지 사용자 부담', '오류 복구 누락']
  },
  sylveon: {
    responsibility: '저자 원문·실제 경험·독자·목적을 지키며 바로 검토할 콘텐츠를 편집한다.',
    decisionRules: ['원문 생각과 저자 경험을 보존한다. 참고 글의 1인칭·성과·감정을 저자의 사실로 옮기지 않는다.', '채널·독자·이번 목적에 맞춰 훅과 구조를 선택한다. 3초 후크·SNS/B2B 이분법을 고정 해답으로 강요하지 않는다.', '본문을 실제 완성하고 변형·미확인 주장·승인할 부분을 짧게 남긴다. 콘텐츠가 항상 판매로 이어져야 한다고 가정하지 않는다.'],
    inputFields: [field('sourceVoice', '저자 원문·실제 경험·피할 말'), field('audiencePurpose', '독자·채널·이번 목적'), field('claimBoundary', '사용 가능한 주장·자료·제약')],
    outputFields: [field('draft', '완성 콘텐츠 본문'), field('editorialNotes', '원문 보존·변형·주장 확인'), field('publicationBoundary', '사용자 승인·발행 전 확인')],
    qualityChecks: ['원문 없는 경험·효과·성과가 추가되지 않았는가', '독자와 목적에 맞는 실제 본문이 있는가', '편집·승인·발행 상태가 구분되는가'],
    boundaries: ['정치 YouTube 중단·Meta 보류를 현재 제약으로 유지한다.', '게시·예약·실제 반응·전환 효과를 실행 또는 관측했다고 말하지 않는다.'],
    handoffs: [{ to: 'umbreon', when: '효과·계약·개인정보·경험 주장을 검토할 때', packet: '원고 최신 버전·주장 출처·대상 독자·미확인' }, { to: 'glaceon', when: '확정 제품의 사용 설명이 필요할 때', packet: '독자 질문·본문 초안·실제 기능 확인 필요 항목' }],
    behavior: { goodJudgment: '학습 메모에는 원문의 생각을 살린 완성 원고를 쓰고 판매 CTA를 억지로 넣지 않는다.', badJudgment: '3초 후크를 위해 남의 경험·성과를 저자의 것으로 만들거나 보류 채널 발행을 제안한다.', askWhen: '저자의 경험·독자·목적에 따라 문안이 달라질 때', exampleQuestion: '이 글은 경험 공유인가요, 사용법 설명인가요? 실제 겪은 부분은 어디까지인가요?' },
    failurePolicy: ['원문이 없으면 자리표시자·필요한 저자 입력으로 반환한다.', '미확인 주장은 삭제 또는 명시적 확인 대상으로 남긴다.'],
    metrics: ['저자 채택·수정량', '근거 없는 경험·효과', '본문 재작업', '실제 독자 반응·기간별 관측']
  }
};
export const OFFICE_ROLE_DEPTH_REGISTRY = freeze(Object.fromEntries(OFFICE_ROSTER.map(role => [role.id, { id: role.id, name: role.name, role: role.role, ...definitions[role.id] }])));
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
function keys(value, allowed, required = allowed) { check(plain(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), '전문 업무 계약의 필드를 확인해 주세요.'); }
function text(value, max) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, '전문 입력·산출물의 길이와 빈칸을 확인해 주세요.'); return value.trim(); }
function list(value, max, size) { check(Array.isArray(value) && value.length <= max, '전문 업무 목록 한도를 확인해 주세요.'); return value.map(item => text(item, size)); }
function ref(value) { const result = text(value, 160); check(/^[a-zA-Z0-9._:-]+$/.test(result), '전문 업무 참조를 확인해 주세요.'); return result; }
function unique(items) { check(new Set(items).size === items.length, '전문 업무 입력·출처가 중복됐습니다.'); }
export function getOfficeRoleDepth(ownerId) { const role = OFFICE_ROLE_DEPTH_REGISTRY[ownerId]; check(Object.hasOwn(OFFICE_ROLE_DEPTH_REGISTRY, ownerId), '등록된 전문 담당을 선택해 주세요.'); return role; }
export function renderOfficeRoleDepthInstructions(ownerId) {
  const role = getOfficeRoleDepth(ownerId);
  return `[전문 판단 보강 ${OFFICE_ROLE_DEPTH_VERSION} · 기존 예시보다 우선]\n${role.name}의 고유 책임: ${role.responsibility}\n${role.decisionRules.join('\n')}\n판단에 필요한 자료: ${role.inputFields.map(item => item.label).join(' / ')}. 이미 주어진 자료는 다시 묻지 않는다.\n복잡한 업무의 실제 산출물: ${role.outputFields.map(item => item.label).join(' / ')}. 짧은 확인·인사·휴식에는 이 양식을 강요하지 않는다.\n좋은 판단: ${role.behavior.goodJudgment}\n피할 판단: ${role.behavior.badJudgment}\n질문은 ${role.behavior.askWhen}에만 한다.\n${role.boundaries.join('\n')}\n인계는 제안이며 수신 확인·현 버전 검토 없이 새 일·실행·완료로 바꾸지 않는다. 권한·예산 자기 승급은 금지한다.`;
}
export function parseOfficeRoleBrief(value) {
  keys(value, ['version', 'taskId', 'ownerId', 'epoch', 'scope', 'goal', 'inputs', 'sources', 'completionCriteria', 'constraints', 'boundary'], ['version', 'taskId', 'ownerId', 'epoch', 'scope', 'goal', 'inputs', 'sources', 'completionCriteria', 'constraints']);
  check(value.version === OFFICE_ROLE_DEPTH_VERSION && ['classin', 'personal'].includes(value.scope) && Number.isInteger(value.epoch) && value.epoch >= 0 && value.epoch <= 1000, '전문 계약의 버전·범위를 확인해 주세요.');
  const role = getOfficeRoleDepth(value.ownerId); keys(value.inputs, role.inputFields.map(item => item.key), []);
  const inputs = Object.fromEntries(Object.entries(value.inputs).map(([key, item]) => [key, text(item, 500)]));
  check(Array.isArray(value.sources) && value.sources.length <= 3, '원문 출처는 최대 세 개입니다.');
  const sources = value.sources.map(source => { keys(source, ['id', 'label', 'scope', 'excerpt', 'binding'], ['id', 'label', 'scope', 'excerpt']); if(source.binding)keys(source.binding,['boundary','artifact']); check(source.scope === value.scope, '다른 업무 범위의 자료는 사용할 수 없습니다.'); return { id: ref(source.id), label: text(source.label, 120), scope: source.scope, excerpt: text(source.excerpt, 1000), ...(source.binding ? { binding: { boundary: parseOfficeWorkBoundary(source.binding.boundary), artifact: parseOfficeArtifactRef(source.binding.artifact) } } : {}) }; }); unique(sources.map(source => source.id));
  const boundary = value.boundary ? parseOfficeWorkBoundary(value.boundary) : null; check(!boundary || boundary.scope === value.scope && sources.every(source => source.binding && sameOfficeWorkBoundary(source.binding.boundary, boundary)), '브랜드·범위가 다른 자료를 연결할 수 없습니다.');
  const completionCriteria = list(value.completionCriteria, 3, 250); check(completionCriteria.length > 0, '이번 결과의 완료 기준을 하나 이상 남겨 주세요.');
  return { version: value.version, taskId: ref(value.taskId), ownerId: role.id, epoch: value.epoch, scope: value.scope, goal: text(value.goal, 300), inputs, sources, completionCriteria, constraints: list(value.constraints, 3, 250), ...(boundary ? { boundary } : {}) };
}
export function officeRoleBriefBinding(value) { return JSON.stringify(parseOfficeRoleBrief(value)); }
export function officeRoleMissingInputs(value) { const brief = parseOfficeRoleBrief(value); return getOfficeRoleDepth(brief.ownerId).inputFields.filter(item => item.required && !brief.inputs[item.key]).map(item => item.key); }
export function parseOfficeRoleOutput(value, briefValue) {
  const brief = parseOfficeRoleBrief(briefValue), role = getOfficeRoleDepth(brief.ownerId);
  keys(value, ['version', 'taskId', 'ownerId', 'epoch', 'scope', 'briefBinding', 'status', 'fields', 'claims', 'uncertainties', 'questions', 'nextAction', 'calculations'], ['version', 'taskId', 'ownerId', 'epoch', 'scope', 'briefBinding', 'status', 'fields', 'claims', 'uncertainties', 'questions', 'nextAction']);
  check(value.version === OFFICE_ROLE_DEPTH_VERSION && value.taskId === brief.taskId && value.ownerId === brief.ownerId && value.epoch === brief.epoch && value.scope === brief.scope && value.briefBinding === officeRoleBriefBinding(brief), '담당·원문·완료 기준이 바뀌었습니다. 최신 전문 결과를 받아 주세요.');
  check(['draft', 'needs_input'].includes(value.status), '전문 결과는 초안 또는 정보 부족입니다.'); keys(value.fields, role.outputFields.map(item => item.key), []);
  const fields = Object.fromEntries(Object.entries(value.fields).map(([key, item]) => [key, text(item, 1000)]));
  check(Array.isArray(value.claims) && value.claims.length <= 4, '주장은 최대 네 개까지 구분해 주세요.');
  const claims = value.claims.map(claim => { keys(claim, ['kind', 'text', 'sourceIds', 'quote', 'reason']); check(['fact', 'inference', 'proposal'].includes(claim.kind), '사실·추론·제안을 구분해 주세요.'); const sourceIds = list(claim.sourceIds, 3, 160); unique(sourceIds); check(sourceIds.every(id => brief.sources.some(source => source.id === id)), '제공하지 않은 원문 출처를 사용할 수 없습니다.'); check(claim.quote === null || typeof claim.quote === 'string' && claim.quote.length > 0 && claim.quote.length <= 300, '원문 인용 길이를 확인해 주세요.'); const quote = claim.quote === null ? null : text(claim.quote, 300); const reason = claim.reason === null ? null : text(claim.reason, 400); if (claim.kind === 'fact') check(sourceIds.length > 0 && quote !== null && sourceIds.some(id => brief.sources.find(source => source.id === id).excerpt.includes(quote)), '사실 주장은 제공된 원문의 정확 인용과 연결해야 합니다.'); if (claim.kind === 'inference') check(reason !== null, '추론의 이유·가정을 명시해 주세요.'); return { kind: claim.kind, text: text(claim.text, 500), sourceIds, quote, reason }; });
  const uncertainties = list(value.uncertainties, 4, 250);
  check(Array.isArray(value.questions) && value.questions.length <= 3, '결론을 바꾸는 질문만 최대 세 개 남겨 주세요.');
  const questions = value.questions.map(question => { keys(question, ['inputKey', 'question']); check(role.inputFields.some(item => item.key === question.inputKey), '질문은 이번 담당의 입력과 연결해야 합니다.'); return { inputKey: question.inputKey, question: text(question.question, 250) }; }); unique(questions.map(question => question.inputKey));
  const missing = officeRoleMissingInputs(brief);
  if (value.status === 'draft') check(missing.length === 0 && role.outputFields.every(item => fields[item.key]) && questions.length === 0, '필수 입력·전문 산출물이 누락됐습니다. 정보 부족으로 반환해 주세요.');
  else check(questions.length > 0 && (missing.length === 0 || missing.every(key => questions.some(question => question.inputKey === key))), '정보 부족에는 필요한 입력과 질문을 연결해 주세요.');
  let nextAction = null; if (value.nextAction !== null) { keys(value.nextAction, ['ownerId', 'action', 'condition']); check(value.nextAction.ownerId === brief.ownerId, '다음 행동의 owner는 현재 담당을 유지합니다. 다른 담당은 명시적 인계로 연결해 주세요.'); nextAction = { ownerId: brief.ownerId, action: text(value.nextAction.action, 400), condition: text(value.nextAction.condition, 300) }; }
  return { version: value.version, taskId: brief.taskId, ownerId: brief.ownerId, epoch: brief.epoch, scope: brief.scope, briefBinding: value.briefBinding, status: value.status, fields, claims, uncertainties, questions, nextAction, ...(value.calculations !== undefined ? { calculations: (() => { check(Array.isArray(value.calculations) && value.calculations.length <= 3, '정형 계산은 최대 세 개입니다.'); return value.calculations.map(parseOfficeTimeCalculation); })() } : {}) };
}
export function officeRoleOutputBody(value, brief) {
  const output = parseOfficeRoleOutput(value, brief), role = getOfficeRoleDepth(output.ownerId), names = { fact: '원문 연결 사실 · 의미 검수 필요', inference: '추론', proposal: '제안' };
  return [`${role.name} · ${role.role} · ${output.status === 'needs_input' ? '정보 부족' : '전문 초안'}`, ...role.outputFields.filter(item => output.fields[item.key]).map(item => `[${item.label}]\n${output.fields[item.key]}`), ...output.claims.map(claim => `[${names[claim.kind]}] ${claim.text}${claim.quote ? '\n원문 인용: ' + claim.quote : ''}${claim.reason ? '\n이유·가정: ' + claim.reason : ''}`), ...(output.calculations||[]).map(item=>`정형 시간 계산 · 입력 값 기준(${item.basis}): 첫 ${item.weeks}주 ${item.firstPeriodMinutes}분, 같은 기간 반복 ${item.repeatedPeriodMinutes}분. 자유 본문·입력 진실성 인증 아님.`), ...output.questions.map(item => `확인 질문: ${item.question}`), ...output.uncertainties.map(item => `미확인: ${item}`), output.nextAction ? `다음 행동 제안: ${output.nextAction.action} · 조건: ${output.nextAction.condition}` : '추가 행동 제안 없음.'].join('\n\n');
}
export function officeRoleReviewGate(outputValue, briefValue) {
  const brief = parseOfficeRoleBrief(briefValue), output = parseOfficeRoleOutput(outputValue, brief);
  return { allowed: output.status === 'draft' && brief.sources.length > 0, missingInputs: officeRoleMissingInputs(brief), checks: getOfficeRoleDepth(brief.ownerId).qualityChecks, sourceTruth: 'provided_quote_link_only', independentVerification: false, executionApproved: false, reason: output.status === 'needs_input' ? '필요한 입력을 확인한 뒤 전문 결과를 다시 준비해 주세요.' : !brief.sources.length ? '원문 자료를 제공하고 실제 의미를 검토해 주세요.' : '계약·인용 결속만 확인했습니다. 원문 의미·실무 정확성은 직접 검토해 주세요.' };
}
export function parseOfficeRoleHandoffAck(value, source, target) {
  keys(value, ['status', 'toOwnerId', 'consumedResultBinding', 'inputSummary', 'reason']);
  check(['accepted', 'needs_input', 'rejected_out_of_scope'].includes(value.status) && value.toOwnerId === target.ownerId && source.id !== target.id && source.ownerId !== null && target.ownerId !== null, '수신 담당과 인계 응답을 확인해 주세요.');
  check(value.consumedResultBinding === source.review?.binding, '인계할 원문의 검수 버전이 바뀌었습니다.');
  return { status: value.status, toOwnerId: target.ownerId, consumedResultBinding: text(value.consumedResultBinding, 60000), inputSummary: text(value.inputSummary, 500), reason: text(value.reason, 500) };
}
