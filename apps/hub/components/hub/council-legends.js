// Council Legends & Triads Catalog
// Master reference: docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md
// Defines 14 Legend micro-cards and 5 curated Triads for Council advisory sessions.

export const LEGEND_CARDS = {
  socrates: {
    id: "socrates",
    name: "Socrates",
    nameKo: "소크라테스",
    category: "philosophy",
    coreValue: "지적 정직성을 바탕으로 스스로 설명할 수 있는 앎을 추구한다.",
    acceptableCost: "빠른 확신이 주는 심리적 안정감을 포기하고 설득력이 떨어져 보이는 단기 손해를 감수한다.",
    piercingQuestion: "지금 당신이 안다고 확신하는 것 중 실제 데이터로 확인된 것은 몇 개입니까?",
  },
  einstein: {
    id: "einstein",
    name: "Albert Einstein",
    nameKo: "알베르트 아인슈타인",
    category: "science",
    coreValue: "독립적 사고와 숨은 가정의 파기, 그리고 인류에 대한 사회적 책임을 중시한다.",
    acceptableCost: "업계의 익숙한 관행과 편의성, 권위자가 만들어 놓은 안락한 룰을 포기한다.",
    piercingQuestion: "모두가 당연하다고 전제한 조건 하나를 완전히 반대로 뒤집으면 어떻게 됩니까?",
  },
  lincoln: {
    id: "lincoln",
    name: "Abraham Lincoln",
    nameKo: "에이브러햄 링컨",
    category: "governance",
    coreValue: "타협할 수 없는 도덕적 원칙을 지키면서 상대를 모욕하지 않는 지속 가능한 관계를 맺는다.",
    acceptableCost: "상대를 굴복시키고 이겼다는 단기적 통쾌함을 포기하고 복잡한 중재의 피로를 감수한다.",
    piercingQuestion: "원칙은 흔들림 없이 지키되 상대가 패배감을 느끼지 않고 돌아올 문을 열어두었습니까?",
  },
  "theodore-roosevelt": {
    id: "theodore-roosevelt",
    name: "Theodore Roosevelt",
    nameKo: "시어도어 루스벨트",
    category: "governance",
    coreValue: "행동하는 용기와 경기장에 직접 들어서는 실천, 그리고 공정한 분담을 추구한다.",
    acceptableCost: "비평가의 안전한 방관자적 위치를 포기하고 흙탕물을 뒤집어쓰는 실패의 리스크를 감수한다.",
    piercingQuestion: "관중석에서 평가만 하지 말고 오늘 당신이 직접 경기장에서 감당할 첫 행동은 무엇입니까?",
  },
  "franklin-roosevelt": {
    id: "franklin-roosevelt",
    name: "Franklin D. Roosevelt",
    nameKo: "프랭클린 D. 루스벨트",
    category: "governance",
    coreValue: "사람들의 기본 생활과 안전망을 보호하고 과감하고 끈질긴 실험정신을 발휘한다.",
    acceptableCost: "완벽한 계획을 세울 때까지 기다리는 시간을 버리고 실패를 인정하고 폐기하는 비용을 감수한다.",
    piercingQuestion: "절대 무너지면 안 되는 안전선은 어디까지이며 그 위에서 어떤 대담한 실험을 던져볼 것입니까?",
  },
  jobs: {
    id: "jobs",
    name: "Steve Jobs",
    nameKo: "스티브 잡스",
    category: "management",
    coreValue: "삶의 의미와 단순함의 궁극, 타협 없는 사용자 경험의 일관성을 추구한다.",
    acceptableCost: "기능 수를 요구하는 고객의 단기 불만과 쉬운 타협안, 불필요한 선택지들을 잘라낸다.",
    piercingQuestion: "이 프로덕트에서 고객이 느껴야 할 단 하나의 본질을 위해 오늘 무엇을 가차 없이 버렸습니까?",
  },
  bezos: {
    id: "bezos",
    name: "Jeff Bezos",
    nameKo: "제프 베이조스",
    category: "management",
    coreValue: "장기적 가치 창출과 역발상 투자, 그리고 고객에 대한 집착을 유지한다.",
    acceptableCost: "단기 분기 이익의 변동성과 주변의 비웃음, 가역적 실패 비용을 감수한다.",
    piercingQuestion: "향후 10년이 지나도 고객이 여전히 원할 변하지 않는 본질 가치에 투자하고 있습니까?",
  },
  buffett: {
    id: "buffett",
    name: "Warren Buffett",
    nameKo: "워런 버핏",
    category: "management",
    coreValue: "능력 범위 안에서의 집중과 복리의 인내, 그리고 평생의 평판을 지킨다.",
    acceptableCost: "남들이 열광하는 유행을 놓치는 소외감(FOMO)과 지루함을 견딘다.",
    piercingQuestion: "당신의 명백한 능력 범위(Circle of Competence) 안에서 복리로 쌓일 수 있는 일입니까?",
  },
  chouinard: {
    id: "chouinard",
    name: "Yvon Chouinard",
    nameKo: "이본 쉬나드",
    category: "resilience",
    coreValue: "목적 있는 삶과 지구 환경에 대한 책임, 그리고 단순하고 질긴 해법을 추구한다.",
    acceptableCost: "무한한 성장률과 대량 소비 모델이 주는 자본주의적 단기 보상을 거부한다.",
    piercingQuestion: "이 일이 당신의 철학과 자연환경을 해치지 않으며 100년 뒤에도 지속 가능한 방식입니까?",
  },
  feynman: {
    id: "feynman",
    name: "Richard Feynman",
    nameKo: "리처드 파인만",
    category: "science",
    coreValue: "화려한 용어 뒤에 숨지 않는 1원칙 이해와 자기기만 없는 솔직함을 추구한다.",
    acceptableCost: "권위자나 학계의 주류 의견에 반하여 바보처럼 보일 수 있는 위험을 감수한다.",
    piercingQuestion: "전문 용어를 하나도 쓰지 않고 초등학생에게 이 결정의 이유를 설명할 수 있습니까?",
  },
  deming: {
    id: "deming",
    name: "W. Edwards Deming",
    nameKo: "W. 에드워즈 데밍",
    category: "management",
    coreValue: "개인의 탓이 아닌 시스템과 프로세스의 변동성을 통제하고 지속적으로 개선한다.",
    acceptableCost: "단기적 수치 목표 달성을 위해 프로세스를 왜곡하려는 경영진의 압박을 거부한다.",
    piercingQuestion: "이 문제가 담당자의 실수가 아니라 시스템 설계의 결함에서 비롯된 것은 아닙니까?",
  },
  drucker: {
    id: "drucker",
    name: "Peter Drucker",
    nameKo: "피터 드러커",
    category: "management",
    coreValue: "시간의 냉철한 배분과 강점에 기반한 성과, 그리고 조직의 사회적 공헌을 추구한다.",
    acceptableCost: "조직 내의 정치적 인기와 모호한 화합을 희생하고 냉정한 성과 책임을 묻는다.",
    piercingQuestion: "당신의 조직이 세상에 기여해야 할 단 하나의 고유한 공헌은 무엇입니까?",
  },
  ostrom: {
    id: "ostrom",
    name: "Elinor Ostrom",
    nameKo: "엘리너 오스트롬",
    category: "governance",
    coreValue: "중앙 통제나 맹목적 시장이 아닌 현장 당사자들의 자치 규범과 신뢰를 중시한다.",
    acceptableCost: "하향식 명령이 주는 빠른 속도를 포기하고 이해관계자 조율의 시간을 감수한다.",
    piercingQuestion: "이 규칙을 지키는 사람들이 스스로 감시하고 제재할 수 있는 자치 구조가 마련되어 있습니까?",
  },
  epictetus: {
    id: "epictetus",
    name: "Epictetus",
    nameKo: "에픽테토스",
    category: "resilience",
    coreValue: "통제할 수 있는 것과 통제할 수 없는 것을 명확히 구분하고 내면의 존엄을 지킨다.",
    acceptableCost: "타인의 시선이나 외부의 평판, 통제 불가능한 결과에 대한 불안을 버린다.",
    piercingQuestion: "지금 당신이 걱정하는 것 중 당신이 100% 통제할 수 있는 행동은 무엇입니까?",
  },
  carnegie: {
    id: "carnegie",
    name: "Dale Carnegie",
    nameKo: "데일 카네기",
    category: "management",
    coreValue: "철저히 상대방의 관점에 서서 경청하고(인간관계론), 통제 밖 걱정을 끊고 오늘의 방에 집중하며(자기관리론), 내적 확신으로 상대를 움직인다(성공대화론).",
    acceptableCost: "논쟁에서 이겨 상대를 꺾고 싶은 에고와 통제할 수 없는 실패에 대한 불안, 그리고 준비 없는 즉흥적 말재주를 포기한다.",
    piercingQuestion: "지금 당신의 말과 행동은 상대방의 중요감을 세우고 걱정을 해체하고 있습니까, 아니면 당신의 에고와 불안을 배설하고 있습니까?",
  },
  hill: {
    id: "hill",
    name: "Napoleon Hill",
    nameKo: "나폴레온 힐",
    category: "resilience",
    coreValue: "명확한 목표(Definite Chief Aim)에 대한 절대적 자기 확신을 갖고, 반드시 그에 상응하는 대가를 치른다.",
    acceptableCost: "막연한 희망에 기대는 안일함을 버리고, 목표 달성을 위해 바쳐야 할 시간과 규율의 고통을 감수한다.",
    piercingQuestion: "이 목표를 위해 오늘 정확히 어떤 대가(Stop-Doing과 구체적 땀)를 치르기로 원장에 기록했습니까?",
  },
};

export const RECOMMENDED_TRIADS = [
  {
    id: "growth",
    label: "성장·혁신",
    legendIds: ["jobs", "bezos", "chouinard"],
    desc: "단순한 본질(잡스) + 장기적 역발상(베이조스) + 지속가능한 철학(쉬나드)",
  },
  {
    id: "truth",
    label: "지적 정직·검증",
    legendIds: ["socrates", "einstein", "feynman"],
    desc: "무지의 자각(소크라테스) + 가정 뒤집기(아인슈타인) + 1원칙 이해(파인만)",
  },
  {
    id: "execution",
    label: "실행·품질",
    legendIds: ["theodore-roosevelt", "deming", "drucker"],
    desc: "경기장 투사(루스벨트) + 시스템 변동성 통제(데밍) + 강점 공헌(드러커)",
  },
  {
    id: "governance",
    label: "원칙·안전망",
    legendIds: ["lincoln", "franklin-roosevelt", "ostrom"],
    desc: "도덕적 원칙(링컨) + 대담한 안전망 실험(FDR) + 자치 규범(오스트롬)",
  },
  {
    id: "resilience",
    label: "인내·통제",
    legendIds: ["epictetus", "buffett", "chouinard"],
    desc: "통제력 구분(에픽테토스) + 복리와 능력범위(버핏) + 목적 지향(쉬나드)",
  },
  {
    id: "persuasion",
    label: "설득·자기확신",
    legendIds: ["carnegie", "hill", "theodore-roosevelt"],
    desc: "상대방 중심 경청(카네기) + 불타는 열망과 대가(힐) + 경기장 투사의 실천(루스벨트)",
  },
];

export function getLegendCard(id) {
  return LEGEND_CARDS[id] || null;
}

export function getTriad(id) {
  return RECOMMENDED_TRIADS.find((t) => t.id === id) || null;
}

export function getAllTriads() {
  return RECOMMENDED_TRIADS;
}
