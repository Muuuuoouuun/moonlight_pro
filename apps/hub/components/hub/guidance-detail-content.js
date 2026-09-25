// Card-specific editorial explanations. These are Moonlight interpretations of the
// reviewed source references in @com-moon/guru-guidance, never original quotations.
const CONTENT = {
  'sales-meddic': {
    steps: [
      { label: '선택 기준', text: '상대가 좋다고 말한 이유와 조직이 실제로 비교할 기준을 분리해서 듣습니다.' },
      { label: '결정 과정', text: '누가 어떤 자료를 보고, 누구의 확인 뒤에 결정하는지 상대에게 직접 묻습니다.' },
    ],
    boundary: '내부 승인 구조를 확인하기 전에는 지연 이유를 예산 부족이나 담당자의 반대로 단정하지 않습니다.',
  },
  'sales-gap': {
    steps: [
      { label: '현재 상태', text: '고객이 겪는 문제와 그 원인, 업무상 영향을 고객의 말로 확인합니다.' },
      { label: '원하는 상태', text: '고객이 도달하고 싶은 결과가 무엇인지 현재 상태와 구분해 묻습니다.' },
      { label: '두 상태의 간격', text: '현재와 목표 사이의 차이를 정리한 뒤 제안이 그 차이를 줄일 수 있는지 검토합니다.' },
    ],
    boundary: '불편을 들었다는 이유만으로 구매 의사나 긴급도를 추정하지 않고, 고객이 말한 영향과 목표만 다룹니다.',
  },
  'sales-spin-implication': {
    steps: [
      { label: '문제를 재확인', text: '상대가 직접 말한 불편이 무엇인지 좁혀 확인합니다.' },
      { label: '영향을 질문', text: '그 불편이 이어질 때 시간·업무·결과에 어떤 일이 생기는지 개방형으로 묻습니다.' },
    ],
    boundary: '상대가 아직 문제를 말하지 않았다면 영향을 먼저 만들어 제시하거나 위기를 부풀리지 않습니다.',
  },
  'sales-voss-feasibility': {
    steps: [
      { label: '긍정과 실행 분리', text: '좋다는 반응과 실제로 시작할 수 있는 조건은 서로 다를 수 있습니다.' },
      { label: '조건의 언어', text: '상대가 필요한 승인·일정·준비를 자신의 말로 설명하게 합니다.' },
    ],
    boundary: '보정 질문을 압박이나 약속 강요에 쓰지 않고, 실행 가능성을 함께 이해하는 데만 씁니다.',
  },
  'sales-ross-fit': {
    steps: [
      { label: '좋았던 고객', text: '실제 잘 맞았던 고객에게서 확인한 조건을 먼저 적습니다.' },
      { label: '새 문의 비교', text: '신규 문의에서 그 조건이 있는지 묻고, 다른 점도 함께 기록합니다.' },
    ],
    boundary: '신규라는 상태만으로 적합성을 판정하지 않습니다. 고객군 가설은 대화와 확인된 기록으로 갱신합니다.',
  },
  'sales-ziglar-help': {
    steps: [
      { label: '상대의 목표', text: '제품 설명을 시작하기 전에 상대가 이번 대화로 얻고 싶은 결과를 듣습니다.' },
      { label: '도움의 형태', text: '그 목표에 닿는 부분만 제안하고 맞지 않는 부분은 억지로 연결하지 않습니다.' },
    ],
    boundary: '고객 목표를 들었다는 사실과 내 제안이 실제로 도움이 된다는 판단을 구분합니다.',
  },
  'sales-carnegie-listen': {
    steps: [
      { label: '관심사 듣기', text: '상대가 반복해서 강조한 우선순위와 표현을 놓치지 않습니다.' },
      { label: '이해 확인', text: '내가 이해한 뜻을 짧게 되말하고 상대가 고칠 여지를 남깁니다.' },
    ],
    boundary: '상대의 말을 요약했다고 동의를 얻은 것으로 취급하지 않습니다. 해석이 맞는지 직접 확인합니다.',
  },
  'sales-hill-purpose': {
    steps: [
      { label: '내 목적 한 줄', text: '이번 접촉에서 알아야 할 한 가지를 미리 적습니다.' },
      { label: '질문으로 전환', text: '그 목적을 상대가 답할 수 있는 열린 질문으로 바꿉니다.' },
    ],
    boundary: '운영자 자신의 준비를 돕는 관점입니다. 목적을 정했다고 고객 반응이나 계약 결과를 예측하지 않습니다.',
  },
  'sales-girard-after-sale': {
    steps: [
      { label: '약속 목록', text: '계약 뒤 제공하기로 한 지원과 안내를 실제 기록에서 확인합니다.' },
      { label: '이행 확인', text: '보냈다는 사실보다 고객이 필요한 지원을 받았는지 묻습니다.' },
    ],
    boundary: '자동 반복 연락을 뜻하지 않습니다. 계약과 약속이 확인된 고객에게만 상황에 맞게 적용합니다.',
  },
  'sales-tracy-needs': {
    steps: [
      { label: '문제의 언어', text: '고객이 해결하고 싶은 일을 고객의 표현 그대로 듣습니다.' },
      { label: '해법 연결', text: '확인된 필요와 제안이 만나는 지점을 설명하고 맞지 않으면 보류합니다.' },
    ],
    boundary: '질문에 대한 답을 듣기 전에는 고객 니즈를 미리 작성하거나 판매 성과를 약속하지 않습니다.',
  },
  'sales-cardone-own-effort': {
    steps: [
      { label: '내 준비', text: '목표에 비해 조사·질문 준비·약속 이행이 충분했는지 자신을 점검합니다.' },
      { label: '부족한 한 가지', text: '고객에게 더 요구하기 전에 내가 보완할 행동 하나를 정합니다.' },
    ],
    boundary: '활동량은 운영자 자기점검에만 씁니다. 고객에게 반복 접촉하거나 압박할 근거로 사용하지 않습니다.',
  },
  'sales-belfort-fit': {
    steps: [
      { label: '필요 확인', text: '상대가 실제로 해결하려는 문제가 무엇인지 먼저 묻습니다.' },
      { label: '제안 적합성', text: '그 문제와 제안의 관계가 약하면 설득을 더하는 대신 보류합니다.' },
    ],
    boundary: '원전의 압박식 클로징을 채택하지 않습니다. 상대의 명시적 필요가 없으면 제안을 밀어붙이지 않습니다.',
  },
  'sales-lemkin-customer-success': {
    steps: [
      { label: '계약 후 사용', text: '반복 서비스 고객이 서비스를 원하는 방식으로 실제 사용 중인지 확인합니다.' },
      { label: '지원의 빈틈', text: '계약 범위와 지원 약속 중 고객이 받지 못한 것이 있는지 살핍니다.' },
    ],
    boundary: 'SaaS 또는 반복 서비스 맥락이 확인될 때만 적용합니다. 모든 고객에게 구독 지표를 요구하지 않습니다.',
  },
  'marketing-smallest-market': {
    steps: [
      { label: '누구를 위한가', text: '모든 사람이 아니라 먼저 돕고 싶은 구체적인 사람을 정합니다.' },
      { label: '무엇을 위한가', text: '그 사람이 찾는 경험과 변화를 분명히 합니다.' },
      { label: '어떻게 퍼지는가', text: '그 집단에 충분한 가치를 주어 비슷한 사람에게 전할 이유를 만듭니다.' },
    ],
    boundary: '고객군을 좁히는 것은 가설입니다. 실제 반응을 확인하기 전에는 다른 고객이 원하지 않는다고 단정하지 않습니다.',
  },
  'marketing-research': {
    steps: [
      { label: '고객 언어', text: '인터뷰·문의·후기에서 고객이 실제로 쓴 표현을 모읍니다.' },
      { label: '확인된 사실', text: '문구에 넣을 혜택이 사례나 제공 조건으로 확인되는지 살핍니다.' },
    ],
    boundary: '오길비의 인쇄 광고 관찰을 지금 채널의 성과 예측으로 확대하지 않습니다.',
  },
  'marketing-permission': {
    steps: [
      { label: '받을 이유', text: '누가 왜 이 메시지를 기다리거나 요청할 만한지 생각합니다.' },
      { label: '기대 유지', text: '채널을 늘리기 전에 약속했던 주제와 빈도에 맞는 내용을 만듭니다.' },
    ],
    boundary: '원전의 허락 마케팅을 모든 메시지가 법적 수신 동의를 받았다는 뜻으로 해석하지 않습니다.',
  },
  'marketing-specific-promise': {
    steps: [
      { label: '추상어 걷기', text: '최고·혁신 같은 표현이 실제로 무엇을 의미하는지 풀어 봅니다.' },
      { label: '검증 가능한 이점', text: '고객이 직접 확인할 수 있는 한 가지 사실이나 결과로 문장을 바꿉니다.' },
    ],
    boundary: '확인되지 않은 성과 수치나 모든 고객에게 똑같이 적용되는 효과를 만들지 않습니다.',
  },
  'marketing-clear-plan': {
    steps: [
      { label: '원하는 변화', text: '고객이 기대하는 결과를 먼저 한 문장으로 둡니다.' },
      { label: '첫걸음', text: '그 결과를 향해 처음 무엇을 하면 되는지 복잡한 설명 없이 보여줍니다.' },
    ],
    boundary: '단계를 단순히 보여주는 일과 실제 제공 과정이 쉬운지는 별개입니다. 없는 절차를 약속하지 않습니다.',
  },
  'content-storybrand': {
    steps: [
      { label: '독자의 과제', text: '첫 문장에서 회사 소개보다 독자가 원하는 변화가 먼저 보이게 합니다.' },
      { label: '브랜드의 역할', text: '브랜드가 그 변화를 어떻게 돕는지 뒤에서 설명합니다.' },
    ],
    boundary: '독자를 주인공으로 둔다고 고객의 경험이나 결과를 허구의 성공담으로 만들지 않습니다.',
  },
  'content-hook': {
    steps: [
      { label: '첫 장의 약속', text: '도입부가 어떤 질문이나 기대를 만들었는지 적습니다.' },
      { label: '본문의 이행', text: '마지막까지 그 질문을 실제로 풀었는지 대조합니다.' },
    ],
    boundary: '영상의 재훅 원리를 카드뉴스에 응용한 Moonlight 해석입니다. 원전이 카드뉴스 효과를 증명한 것은 아닙니다.',
  },
  'content-three-tests': {
    steps: [
      { label: '그려지는가', text: '읽는 사람이 구체적 장면을 떠올릴 수 있는 표현인지 확인합니다.' },
      { label: '확인되는가', text: '사실이나 제공 범위를 물었을 때 근거를 보여 줄 수 있는지 봅니다.' },
      { label: '고유한가', text: '경쟁 브랜드 이름으로 바꿔도 그대로 성립하는 문장인지 점검합니다.' },
    ],
    boundary: '세 질문은 편집 점검 도구입니다. 모두 통과해도 성과가 난다는 보장은 아닙니다.',
  },
  'content-multiplication': {
    steps: [
      { label: '반응한 생각', text: '기존 글에서 실제 반응이나 질문을 얻은 핵심 생각을 하나 고릅니다.' },
      { label: '채널별 재구성', text: '복사하지 않고 새 채널의 길이와 독자가 이해할 사례로 다시 씁니다.' },
    ],
    boundary: '한 소재를 여러 번 쓴다는 뜻이지 같은 글을 여러 채널에 그대로 반복 게시하라는 뜻은 아닙니다.',
  },
  'content-perspective': {
    steps: [
      { label: '공통 주제', text: '널리 이야기되는 주제에서 출발하되 자기 경험이 닿는 부분을 찾습니다.' },
      { label: '직접 본 장면', text: '내가 관찰한 사례나 반례를 붙여 다른 글과 구분되는 생각을 만듭니다.' },
    ],
    boundary: '직접 보지 않은 사례를 개인 경험처럼 쓰지 않고, 관찰과 추측을 문장에서 구분합니다.',
  },
  'legend-buffett': {
    steps: [
      { label: '능력 범위', text: '내가 이해하고 책임질 수 있는 일인지 먼저 살핍니다.' },
      { label: '포기의 비용', text: '새 일을 선택하면 이번 주 무엇을 내려놓아야 하는지 함께 적습니다.' },
    ],
    boundary: '투자에서 나온 능력 범위 개념을 업무 선택에 옮긴 Moonlight 응용입니다. 투자 판단이나 성과 조언이 아닙니다.',
  },
  'legend-feynman': {
    steps: [
      { label: '불리한 사실', text: '내 결론을 지지하는 증거 옆에 맞지 않는 사실을 함께 둡니다.' },
      { label: '바뀔 조건', text: '어떤 확인 결과가 나오면 결론을 수정할지 미리 정합니다.' },
    ],
    boundary: '반례를 찾는 일은 결정을 영원히 미루기 위한 절차가 아닙니다. 중요한 불확실성을 분명히 하는 데 씁니다.',
  },
  'legend-carnegie': {
    steps: [
      { label: '상대의 관심', text: '의견 충돌에서 상대가 중요하게 지키려는 것을 먼저 묻습니다.' },
      { label: '내 주장 정리', text: '상대의 관점을 확인한 뒤에 내 입장을 짧고 분명하게 설명합니다.' },
    ],
    boundary: '경청은 동의를 강요하거나 상대를 조종하는 기술이 아닙니다. 이견과 사실관계는 그대로 드러냅니다.',
  },
};

const VERIFIED_EXCERPTS = {
  'sales-gap': { url: 'https://salesgrowth.com/gap-selling-book/', text: "In every sale, there's a gap." },
  'marketing-smallest-market': { url: 'https://seths.blog/2022/05/the-smallest-viable-audience/', text: 'Specificity is the way.' },
};

export function getGuidanceDetailContent(card) {
  if (!card || typeof card.id !== 'string' || !Object.hasOwn(CONTENT, card.id)) return null;
  const verified = VERIFIED_EXCERPTS[card.id];
  return {
    ...CONTENT[card.id],
    excerpt: verified && card.source?.url === verified.url ? verified.text : null,
  };
}
