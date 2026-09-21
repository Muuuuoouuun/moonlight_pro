export type LegendCategory = 'philosophy' | 'science' | 'management' | 'governance' | 'resilience';

export interface LegendMicroCard {
  id: string;
  name: string;
  nameKo: string;
  category: LegendCategory;
  coreValue: string;        // 1 sentence: 핵심 가치
  acceptableCost: string;   // 1 sentence: 감수할 비용
  pivotCondition: string;   // 1 sentence: 결론을 바꿀 조건
  piercingQuestion: string; // 1 sentence: 날카로운 판단 질문
  boundaryCondition: string;// 1 sentence: 비적용/경계 조건
  sourceCitation: string;   // 원전 출처 (저작/연설명)
}

export const LEGEND_MICRO_CARDS: Record<string, LegendMicroCard> = {
  socrates: {
    id: 'socrates',
    name: 'Socrates',
    nameKo: '소크라테스',
    category: 'philosophy',
    coreValue: '지적 정직성을 바탕으로 스스로 설명할 수 있는 앎을 추구한다.',
    acceptableCost: '빠른 확신이 주는 심리적 안정감을 포기하고 설득력이 떨어져 보이는 단기 손해를 감수한다.',
    pivotCondition: '모호했던 정의가 데이터로 입증되거나 반례가 논파되었을 때 결론을 수정한다.',
    piercingQuestion: '지금 당신이 안다고 확신하는 것 중 실제 데이터로 확인된 것은 몇 개입니까?',
    boundaryCondition: '끝없는 회의주의로 결정을 마비시키지 않으며 실무적 합의와 생계의 제약을 부정하지 않는다.',
    sourceCitation: '플라톤의 『변명(Apology)』',
  },
  einstein: {
    id: 'einstein',
    name: 'Albert Einstein',
    nameKo: '알베르트 아인슈타인',
    category: 'science',
    coreValue: '독립적 사고와 숨은 가정의 파기, 그리고 인류에 대한 사회적 책임을 중시한다.',
    acceptableCost: '업계의 익숙한 관행과 편의성, 권위자가 만들어 놓은 안락한 룰을 포기한다.',
    pivotCondition: '다른 가정을 세운 사고실험이 실제 관찰 데이터와 불일치할 때 가설을 수정한다.',
    piercingQuestion: '모두가 당연하다고 전제한 조건 하나를 완전히 반대로 뒤집으면 어떻게 됩니까?',
    boundaryCondition: '과학적 권위를 비즈니스 도덕의 절대 기준으로 삼지 않는다.',
    sourceCitation: '1932년 「My Credo」, 『Relativity』',
  },
  lincoln: {
    id: 'lincoln',
    name: 'Abraham Lincoln',
    nameKo: '에이브러햄 링컨',
    category: 'governance',
    coreValue: '타협할 수 없는 도덕적 원칙을 지키면서 상대를 모욕하지 않는 지속 가능한 관계를 맺는다.',
    acceptableCost: '상대를 굴복시키고 이겼다는 단기적 통쾌함을 포기하고 복잡한 중재의 피로를 감수한다.',
    pivotCondition: '상대가 책임을 실제로 이행하고 공통의 룰에 합의할 때 협력 범위를 조정한다.',
    piercingQuestion: '원칙은 흔들림 없이 지키되 상대가 패배감을 느끼지 않고 돌아올 문을 열어두었습니까?',
    boundaryCondition: '명백한 계약 위반이나 사기에 대해 무작정 온정주의를 베풀지 않는다.',
    sourceCitation: '1864년 Hodges 서한, 1865년 두 번째 취임사',
  },
  'theodore-roosevelt': {
    id: 'theodore-roosevelt',
    name: 'Theodore Roosevelt',
    nameKo: '시어도어 루스벨트',
    category: 'governance',
    coreValue: '행동하는 용기와 경기장에 직접 들어서는 실천, 그리고 공정한 분담을 추구한다.',
    acceptableCost: '비평가의 안전한 방관자적 위치를 포기하고 흙탕물을 뒤집어쓰는 실패의 리스크를 감수한다.',
    pivotCondition: '참여자의 신체적·물리적 한계가 명백하여 구조적 룰을 먼저 고쳐야 할 때 행동을 조정한다.',
    piercingQuestion: '관중석에서 평가만 하지 말고 오늘 당신이 직접 경기장에서 감당할 첫 행동은 무엇입니까?',
    boundaryCondition: '에너지 0인 사람에게 무리한 행동을 강요하여 탈진시키지 않으며 휴식을 전략적 정비로 인정한다.',
    sourceCitation: '1910년 연설 「Citizenship in a Republic」(경기장의 투사), 『The New Nationalism』',
  },
  'franklin-roosevelt': {
    id: 'franklin-roosevelt',
    name: 'Franklin D. Roosevelt',
    nameKo: '프랭클린 D. 루스벨트',
    category: 'governance',
    coreValue: '사람들의 기본 생활과 안전망을 보호하며 과감하고 끈질긴 실험정신을 발휘한다.',
    acceptableCost: '완벽한 계획을 세울 때까지 기다리는 시간을 버리고 실패를 인정하고 폐기하는 비용을 감수한다.',
    pivotCondition: '시도한 실험이 보호해야 할 사람에게 더 큰 고통을 주거나 지표가 개선되지 않을 때 방법을 바꾼다.',
    piercingQuestion: '절대 무너지면 안 되는 안전선은 어디까지이며 그 위에서 어떤 대담한 실험을 던져볼 것입니까?',
    boundaryCondition: '이상적인 구호만 외치며 재정 건전성과 실행 주체의 역량을 무시하지 않는다.',
    sourceCitation: '1941년 「네 가지 자유(Four Freedoms)」 연설, 1932년 Oglethorpe 연설',
  },
  jobs: {
    id: 'jobs',
    name: 'Steve Jobs',
    nameKo: '스티브 잡스',
    category: 'management',
    coreValue: '삶의 의미와 단순함의 궁극, 그리고 타협 없는 사용자 경험의 일관성에 집중한다.',
    acceptableCost: '기능 수를 요구하는 고객의 단기 불만과 쉬운 타협안, 불필요한 선택지들을 과감히 버린다.',
    pivotCondition: '집중한 핵심 경험이 실제 사용자에게 가치를 전달하지 못한다는 명백한 증거가 나올 때 구성을 바꾼다.',
    piercingQuestion: '이 프로덕트에서 고객이 느껴야 할 단 하나의 본질을 위해 오늘 무엇을 가차 없이 버렸습니까?',
    boundaryCondition: '개인의 고집으로 릴리즈를 무한정 연기하거나 함께 일하는 팀을 소모시키지 않는다.',
    sourceCitation: '2005년 스탠퍼드 대학교 졸업식 연설, 2007년 iPhone 발표회',
  },
  bezos: {
    id: 'bezos',
    name: 'Jeff Bezos',
    nameKo: '제프 베이조스',
    category: 'management',
    coreValue: '장기적 고객 가치와 가역적(2-Way Door) 결정의 빠른 실행, 그리고 프로세스 관료주의 거부를 고수한다.',
    acceptableCost: '100% 확신을 갖지 못해 생기는 불안감과 단기 수익률의 희생을 감수한다.',
    pivotCondition: '실제 고객 행동 지표가 가설과 반대로 움직이거나 되돌릴 수 없는 리스크가 감지될 때 중단하거나 수정한다.',
    piercingQuestion: '이 결정이 되돌릴 수 있는 문이라면 왜 70%의 정보만으로 지금 당장 실험하지 않습니까?',
    boundaryCondition: '고객 만족이라는 명분 뒤에 숨어 공급자나 실무자의 과도한 희생을 강요하지 않는다.',
    sourceCitation: '1997년·2016년 아마존 주주서한(Letters to Shareholders)',
  },
  buffett: {
    id: 'buffett',
    name: 'Warren Buffett',
    nameKo: '워런 버핏',
    category: 'management',
    coreValue: '철저히 이해하는 것에만 집중하는 능력 범위(Circle of Competence)와 인내심, 장기적 내재 가치를 중시한다.',
    acceptableCost: '남들이 돈을 벌 때 느끼는 소외감(FOMO)과 화려하고 유행하는 기회의 외면을 감당한다.',
    pivotCondition: '비즈니스의 현금 창출 구조와 비용 구조를 완벽히 이해하고 안전마진이 확보될 때 참여한다.',
    piercingQuestion: '이 비즈니스가 어떻게 가치를 만들고 어디서 자원을 소모하는지 완전히 이해하고 있습니까?',
    boundaryCondition: '작은 학습 목적의 탐색 실험까지 대규모 자본 투자와 동일한 잣대로 가로막지 않는다.',
    sourceCitation: '1996년 버크셔 해서웨이 주주서한(Letters to Shareholders)',
  },
  chouinard: {
    id: 'chouinard',
    name: 'Yvon Chouinard',
    nameKo: '이본 쉬나드',
    category: 'management',
    coreValue: '환경과 삶에 대한 책임을 다하며 운영 방식과 철학이 일치하는 영속 가능한 구조를 만든다.',
    acceptableCost: '무한 성장이 주는 과실과 쉬운 외주 및 저품질 대량 생산의 달콤함을 단호히 거부한다.',
    pivotCondition: '지속 가능성을 추구하는 방식이 비즈니스의 기초 생존을 위협할 때 운영 대안을 재검토한다.',
    piercingQuestion: '회사가 10배 커져도 지금의 운영 방식과 철학을 부끄러움 없이 지켜낼 수 있습니까?',
    boundaryCondition: '선한 의도만으로 재무적 파산이나 무책임한 운영을 정당화하지 않는다.',
    sourceCitation: '2022년 파타고니아 소유 구조 변경 서한',
  },
  feynman: {
    id: 'feynman',
    name: 'Richard Feynman',
    nameKo: '리처드 파인만',
    category: 'science',
    coreValue: '자신을 속이지 않는 태도와 불리한 증거까지 투명하게 공개하는 과학적 정직성을 지킨다.',
    acceptableCost: '내 가설이 틀렸음을 인정하는 뼈아픈 고통과 화려한 프레임워크의 붕괴를 감수한다.',
    pivotCondition: '내 가설을 반증하는 단 하나의 명백한 관찰 데이터가 확인되었을 때 즉시 생각을 바꾼다.',
    piercingQuestion: '당신의 아이디어가 완전히 틀렸음을 증명할 수 있는 불리한 사실을 의도적으로 숨기고 있지는 않습니까?',
    boundaryCondition: '비즈니스의 빠른 가설 검증 속도와 자연과학의 엄밀한 증명 절차를 혼동하여 실행을 멈추지 않는다.',
    sourceCitation: '1974년 칼텍 졸업식 연설 「Cargo Cult Science」',
  },
  deming: {
    id: 'deming',
    name: 'W. Edwards Deming',
    nameKo: 'W. 에드워즈 데밍',
    category: 'management',
    coreValue: '시스템에 의한 체계적 품질 개선과 공포 없는 조직, 그리고 데이터 기반 학습을 지향한다.',
    acceptableCost: '개인을 탓하고 끝내는 손쉬운 비난의 유혹을 버리고 프로세스를 측정하고 개선하는 지난한 노력을 감수한다.',
    pivotCondition: 'PDSA 사이클에서 예측한 계획과 실제 관찰 결과 사이의 괴리가 확인되었을 때 프로세스를 수정한다.',
    piercingQuestion: '이 실패는 개인의 게으름 때문입니까, 아니면 실패할 수밖에 없게 설계된 시스템의 결함입니까?',
    boundaryCondition: '한두 번의 작은 사이클 실험 결과를 곧바로 전사적 불변 법칙으로 성급하게 일반화하지 않는다.',
    sourceCitation: 'Deming Institute, 「Plan-Do-Study-Act Cycle」 및 14개 경영 원칙',
  },
  drucker: {
    id: 'drucker',
    name: 'Peter Drucker',
    nameKo: '피터 드러커',
    category: 'management',
    coreValue: '외부 고객의 관점에서 본 성과와 강점에 집중하며 의미를 다한 과거 업무의 체계적 폐기를 실천한다.',
    acceptableCost: '익숙하고 정든 과거의 업무를 버리는 고통과 사내 정치 및 내부 활동에 쏟는 시간의 상실을 감수한다.',
    pivotCondition: '고객이 가치를 느끼지 못하거나 투입 대비 공헌도가 현저히 떨어지는 활동이 식별될 때 즉각 중단한다.',
    piercingQuestion: '당신이 오늘 가장 많은 시간을 쓴 일 중 고객이 기꺼이 대가를 지불할 가치는 몇 퍼센트입니까?',
    boundaryCondition: '정량적 성과 지표로 즉시 환산하기 어려운 신뢰와 기초 탐색의 영역을 함부로 난도질하지 않는다.',
    sourceCitation: '『경영의 실제(The Practice of Management)』, 『자기경영노트(The Effective Executive)』',
  },
  ostrom: {
    id: 'ostrom',
    name: 'Elinor Ostrom',
    nameKo: '엘리너 오스트롬',
    category: 'governance',
    coreValue: '일방적 통제나 방임 대신 참여자가 납득하는 명확한 경계와 자치 규칙, 그리고 상호 신뢰를 구축한다.',
    acceptableCost: '독점적 결정권의 분산과 규칙 위반에 대한 점진적 제재를 집행하는 번거로움을 감수한다.',
    pivotCondition: '참여자들이 규칙을 불공정하다고 느끼거나 감시 비용이 자원의 실질 가치를 초과할 때 룰을 재설계한다.',
    piercingQuestion: '이 협업에서 자원과 노력을 무임승차하는 행위를 방지할 명확하고 투명한 자치 규칙이 존재합니까?',
    boundaryCondition: '1인 독립 실행 체제나 작은 실험에서 불필요한 거버넌스 오버헤드를 강요하지 않는다.',
    sourceCitation: '2009년 노벨 경제학상 수상 강연, 『공유의 비극을 넘어(Governing the Commons)』',
  },
  epictetus: {
    id: 'epictetus',
    name: 'Epictetus',
    nameKo: '에픽테토스',
    category: 'resilience',
    coreValue: '내 통제 안에 있는 판단과 행동, 그리고 통제 밖의 결과를 엄격히 분리하여 평정심을 유지한다.',
    acceptableCost: '통제할 수 없는 결과를 억지로 통제하려 들며 얻던 불안과 분노의 집착을 기꺼이 내려놓는다.',
    pivotCondition: '내가 쏟는 에너지가 통제할 수 없는 외부 영역에 머물고 있음을 자각했을 때 즉시 관점을 전환한다.',
    piercingQuestion: '지금 당신을 불안하게 만드는 문제 중 100% 당신의 힘으로 바꿀 수 있는 것은 정확히 무엇입니까?',
    boundaryCondition: '모든 사회적 불의나 환경적 한계를 무조건 마음의 문제로 돌리며 현실을 회피하거나 무기력에 빠지지 않는다.',
    sourceCitation: '『엥케이리디온(Enchiridion)』 제1절',
  },
};

/**
 * Returns a Legend micro-card by its unique ID.
 */
export function getLegendCard(id: string): LegendMicroCard | undefined {
  return LEGEND_MICRO_CARDS[id];
}

/**
 * Returns all 14 Legend micro-cards.
 */
export function getAllLegendCards(): LegendMicroCard[] {
  return Object.values(LEGEND_MICRO_CARDS);
}

/**
 * Formats a Legend micro-card into a concise prompt chunk under 6 lines (exactly 5 lines).
 */
export function formatLegendMicroCard(id: string): string {
  const card = getLegendCard(id);
  if (!card) return '';

  return [
    `[${card.nameKo} (${card.name})] 핵심 가치: ${card.coreValue}`,
    `- 감수할 비용: ${card.acceptableCost}`,
    `- 결론 변경 조건: ${card.pivotCondition}`,
    `- 날카로운 질문: ${card.piercingQuestion}`,
    `- 비적용/경계 조건: ${card.boundaryCondition}`,
  ].join('\n');
}

/**
 * Formats multiple Legend micro-cards into a multi-perspective prompt block.
 */
export function formatLegendTriad(ids: string[]): string {
  const cards = ids
    .map((id) => getLegendCard(id))
    .filter((card): card is LegendMicroCard => Boolean(card));

  if (cards.length === 0) return '';

  return cards.map((card) => formatLegendMicroCard(card.id)).join('\n\n');
}
