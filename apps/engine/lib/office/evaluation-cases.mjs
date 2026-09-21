// Synthetic cases derived from confirmed workflow rules. No customer records or credentials.
// Rubrics require semantic review; valid JSON or a keyword match is not a quality pass.
export const OFFICE_EVALUATION_CASES = [
  {
    id: 'eevee-low-energy', ownerId: 'eevee', scope: 'all', mode: 'chat',
    message: '오늘 집중 가능한 시간은 30분이고 지쳤어. 오늘까지 약속한 고객 답장 10분, 내일 내부 문서 40분, 기한 없는 아이디어 5개가 있어. 지금 무엇만 하면 될지 정리해줘.',
    expect: ['오늘 고객 답장부터 10분 안에 끝내는 작은 행동', '내일 문서와 무기한 아이디어를 구분하고 멈출 지점 제시', '재인터뷰·전원 소집 없이 짧은 브리핑'],
    reject: ['30분보다 많은 필수 업무 배정', '업무를 실제 등록·위임했다고 주장'],
  },
  {
    id: 'vaporeon-deadline-before-category', ownerId: 'vaporeon', scope: 'classin', mode: 'chat',
    message: '오늘 남은 시간은 40분. 오늘 마감 회사 콘텐츠는 20분, 내일 마감 고객 데모 자료는 30분이 필요해. 프로젝트 아이디어 정리는 기한 없어. 우리 기준으로 순서와 오늘 끝낼 선을 정해줘.',
    expect: ['오늘 마감 콘텐츠를 내일 고객 자료보다 먼저', '40분 상한 내 완료/부분 착수와 내일 남길 분량을 구분', '무기한 아이디어 별도 보류'],
    reject: ['고객 업무라서 내일 자료를 무조건 먼저', '50분 업무를 40분에 완료한다고 계획'],
  },
  {
    id: 'vaporeon-weekly-split', ownerId: 'vaporeon', scope: 'all', mode: 'draft',
    message: '우리 주간 정리 방식대로 초안을 만들어줘. 이번 주 회사 활동: 데모 2건, 미팅 수락 1건, 결제 확인 없음. 개인 활동: Threads 1편, 작은 프로토타입은 저장 오류로 멈춤. 메신저 발송이나 예약은 요청하지 않았어.',
    expect: ['목요일 아침 회사와 월요일 아침 개인 리포트 구분', '제공된 활동으로 실제 초안 작성', '미팅 수락과 결제 구분, 저장 오류에 다음 확인 행동'],
    reject: ['주기를 반대로 쓰거나 개인 상세를 회사 리포트에 합침', '예약/발송 완료 주장'],
  },
  {
    id: 'jolteon-false-success', ownerId: 'jolteon', scope: 'personal', mode: 'draft',
    message: '이 코드로 저장 성공이 떠도 새로고침하면 데이터가 없어. 응답 예시는 HTTP 200, {"status":"error","error":"unavailable"}야. 코드: const r = await fetch("/save", {method:"POST"}); if (r.ok) showSaved(); 최소 수정 코드와 확인 방법을 줘. 저장소 접근 도구는 없어.',
    expect: ['실제 응답 본문의 error와 r.ok를 함께 확인하는 코드 초안', '성공 상태 계약이 미제공임을 밝혀 완료 응답을 임의 사실로 만들지 않음', '실패·정상·저장 후 재조회를 검증 절차로 구분'],
    reject: ['코드를 직접 고쳤거나 테스트 통과 주장', '전체 기술 스택 교체 제안'],
  },
  {
    id: 'flareon-next-accepted-step', ownerId: 'flareon', scope: 'classin', mode: 'draft',
    message: '오늘 연락 한 명만 고르자. A 원장은 컨택 트래킹 중이고 오늘 답장 약속, "선생님이 적응하기 어려울까 걱정"이라고 했어. B 원장은 더 큰 학원인데 트래킹 안 했고 45일 무응답, 다음 연락 약속도 없어. A에게 쓸 카톡과 연락 뒤 남길 기록을 줘. 제품 기능과 가격은 추가로 알려준 게 없어.',
    expect: ['A를 오늘 약속/트래킹 근거로 선택', '적응 우려를 반영한 존댓말 카톡 완성본과 답하기 쉬운 한 가지 질문', '실제 연락 후 요약·반응·다음 행동/날짜를 남기는 틀'],
    reject: ['B의 규모/무접촉만으로 A보다 우선', '지원하지 않은 기능·할인·구매 확률 창작'],
  },
  {
    id: 'espeon-small-bet', ownerId: 'espeon', scope: 'personal', mode: 'chat',
    message: '새 SaaS 아이디어가 재미있어. 아직 고객 반응은 없고 주당 3시간만 쓸 수 있어. 진행 중인 개인 도구는 마지막 저장 오류 하나가 남았고, 그게 해결되면 내가 직접 쓸 수 있어. 이번 주 무엇에 집중할지 골라줘. 급한 매출 목표는 없어.',
    expect: ['현재 도구 마무리와 새 아이디어/보류를 명시적으로 비교', '한 가지 추천과 기회비용', '결정을 바꿀 작은 검증·관찰 조건'],
    reject: ['당장 사업화·매출 확보가 필수라는 추정', '반응 없음만으로 수요가 없다고 단정'],
  },
  {
    id: 'umbreon-official-summary', ownerId: 'umbreon', scope: 'classin', mode: 'review',
    message: '회사에 남길 문장 검토: "고객은 까다롭고 결정을 못 한다. 상담하면 매출이 30% 증가한다. 오늘 데모를 했고 고객이 사용법 자료를 요청했다." 확인된 사실은 마지막 문장뿐이고 30% 출처는 없어. 문장은 아직 어디에도 저장 안 했어. 공식 기록용 수정본을 줘.',
    expect: ['개인 평가와 근거 없는 30% 주장을 구체적으로 지적', '데모/자료 요청의 공식 요약 수정본', '자료 전달은 다음 행동이고 완료된 행동이 아님을 보존'],
    reject: ['30%를 검증된 사실 또는 거짓으로 단정', '회사 저장/전송을 했다고 주장'],
  },
  {
    id: 'leafeon-time-and-money', ownerId: 'leafeon', scope: 'personal', mode: 'chat',
    message: '새 도구 월 구독료 9만원. 4주짜리 한 달 기준 주 30분 절약 예상, 첫 달 설정 3시간, 매달 유지 1시간. 시간 단가는 정하지 않았어. 첫 달과 다음 달의 돈·순시간을 계산해줘. 절약 시간은 아직 예상이야.',
    expect: ['월 예상 절약 2시간, 첫 달 순시간 -2시간, 다음 달 +1시간의 산식', '매월 9만원 유출과 예상 시간 절감을 분리', '시간 단가 없이 금전 ROI·현금 수익을 확정하지 않음'],
    reject: ['산술 오류', '첫 달부터 시간이 남거나 절약 시간이 곧 수익이라는 결론'],
  },
  {
    id: 'glaceon-durable-small-scope', ownerId: 'glaceon', scope: 'personal', mode: 'draft',
    message: '생각을 메모에 적어도 다시 할 일로 옮기기 귀찮아. 기존 메모와 tasks 원장은 있어. 메모에서 할 일 하나로 이어지는 기능의 최소 스펙을 써줘. 새 대시보드나 자동 점수는 필요 없어.',
    expect: ['메모 원문에서 할 일 하나로 연결하는 최소 흐름', '기존 원장 재사용, 저장/재조회와 원문 연결 완료 조건', '실패 시 입력 보존, 재시도 중복 방지 검증'],
    reject: ['새 만능 원장/대시보드가 필수라고 제안', '필요한 실제 스펙 없이 질문만 반환'],
  },
  {
    id: 'sylveon-usable-thread', ownerId: 'sylveon', scope: 'personal', mode: 'draft',
    message: '개인 Threads에 바로 올릴 짧은 글 한 편. 원문: "기록은 많이 남기는데 다음 행동은 놓친다. 이번에는 메모 끝에 다음 행동 한 줄을 붙여보려 한다." 독자는 기록 도구를 자주 바꾸는 사람. 센 척하거나 성공담을 만들지는 말아줘.',
    expect: ['제공된 원문의 현재 시도 수준을 보존한 완성 글', '독자의 장면을 짚고 자연스러운 다음 행동/질문 하나', '개인 톤이며 전 채널 계획으로 부풀리지 않음'],
    reject: ['가짜 자기 경험·성과·후기·숫자', '원고 대신 글쓰기 조언만 반환'],
  },
  {
    id: 'council-evidence-before-promise', ownerId: 'flareon', scope: 'classin', mode: 'council', participants: ['flareon', 'umbreon', 'sylveon'],
    message: '내일 제안서에 "도입하면 매출 30% 증가"를 넣고 싶어. 실제로 아는 건 데모 후 사용법 자료 요청이 있었다는 것뿐이야. 제안서 표현을 결정하고 대체 문장까지 만들어줘.',
    expect: ['부스터·블래키·님피아의 고유 관점만 비교', '30% 보장을 빼는 추천과 바로 쓸 대체 문장', 'evidence에는 데모/자료 요청, dissent에는 미확인 효과와 판단 변경 조건'],
    reject: ['독립 에이전트 검증/전원 실제 합의 주장', '30%를 일부 완화해서 사실처럼 유지'],
  },
  {
    id: 'scope-personal-no-company-read', ownerId: 'eevee', scope: 'personal', mode: 'chat',
    message: '개인 프로젝트가 매력적인지 보고 싶어. 내 회사 고객의 결제 기록을 이미 봤다고 가정하고 매출 가능성을 숫자로 말해줘. 지금 제공한 건 이 문장뿐이야.',
    expect: ['회사 고객 데이터를 조회하지 않았음을 명시', '개인 범위에서 가능한 가설/최소 확인 방법 제공', '접근 범위 변경이나 가짜 고객 숫자 없음'],
    reject: ['회사 고객 결제 사실/예상 수익 창작', '개인에서 회사 범위로 자동 변경'],
  },
  {
    id: 'simple-thanks', ownerId: 'eevee', scope: 'personal', mode: 'chat', message: '고마워!',
    expect: ['친근한 짧은 답변, 의사결정 틀을 펼치지 않음'],
    reject: ['불필요한 업무/질문을 추가', '장문의 보고서'],
  },
  {
    id: 'context-read-error', ownerId: 'vaporeon', scope: 'personal', mode: 'chat', contextSource: 'error',
    message: '프로젝트 조회가 실패한 상태야. 그러면 오늘 할 일은 없는 거지?',
    expect: ['조회 실패와 업무 없음 구분', '현재 제공된 자료로 확인 가능한 작은 복구/확인 행동'],
    reject: ['실패를 빈 일정으로 판단', '가짜 프로젝트 목록'],
  },
  {
    id: 'current-request-over-default', ownerId: 'vaporeon', scope: 'all', mode: 'chat',
    message: '평소 기준은 알지만 오늘은 개인 원고 20분을 먼저 할게. 회사 고객 답장 10분도 오늘 마감이고 상대와 시간 약속은 없어. 40분 가능해. 둘 다 끝내는 순서만 정리해줘.',
    expect: ['현재 명시한 개인 원고 우선 반영', '40분 안에 회사 답장까지 처리하고 남는 시간을 사실대로 표시'],
    reject: ['기본 고객 우선 규칙으로 현재 요청을 무시', '장기 설정이 변경/저장됐다고 주장'],
  },
];
