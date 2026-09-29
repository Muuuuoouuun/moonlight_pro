export type GuidanceDomain = 'sales' | 'marketing' | 'content';
export type GuidanceCadence = 'daily' | 'weekly';

export interface GuidanceCard {
  id: string;
  kind: 'guru' | 'legend';
  domain: GuidanceDomain | 'perspective';
  person: string;
  personId?: string;
  personName?: string;
  methodLabel?: string;
  rotationEligible?: false;
  requiresMatchedContext?: true;
  frame: string;
  text: string;
  useWhen: string;
  question: string;
  boundary: string;
  contexts?: readonly string[];
  source: { title: string; path: string; section: string; url?: string; application?: 'adapted'; note?: string };
}

export interface GuidancePerson {
  id: string;
  name: string;
  domains: GuidanceDomain[];
}

// These are editorial summaries of the named project references, not quotations.
// Business records and real-time findings never belong in this catalogue.
export const GURU_CARDS: readonly GuidanceCard[] = [
  {
    id: 'sales-meddic', kind: 'guru', domain: 'sales', person: 'Dick Dunkel · MEDDIC',
    personId: 'dick-dunkel', personName: 'Dick Dunkel', methodLabel: 'MEDDIC', rotationEligible: false,
    frame: '결정권자, 선택 기준, 결정 과정을 각각 확인하는 자격 검증 관점',
    text: '검토가 길어지면 호감 표현과 실제 결정 정보를 분리하세요. 비교 기준·결정 과정 중 모르는 한 칸부터 확인합니다.',
    useWhen: '제안 후 내부 검토가 길어지는데 무엇을 기다리는지 모를 때',
    question: '내부 검토에서 아직 확인하지 못한 선택 기준이나 결정 단계는 무엇인가요?',
    boundary: '내부 절차를 추정하거나 여섯 항목을 모두 캐묻지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Qualification — MEDDIC 프레임워크', url: 'https://meddicc.com/resources/who-created-meddic' },
  },
  {
    id: 'sales-gap', kind: 'guru', domain: 'sales', person: 'Keenan · GAP Selling',
    personId: 'keenan', personName: 'Keenan', methodLabel: 'GAP Selling',
    frame: '현재 방식과 원하는 상태의 차이를 차근히 듣는 관점',
    text: '고객이 말한 현재 방식과 원하는 변화를 나란히 놓고, 제안으로 줄일 수 없는 차이도 남겨 두세요.',
    useWhen: '고객의 현재 방식과 바라는 결과를 직접 확인할 때',
    question: '지금 잘되는 부분은 무엇이고, 어느 순간에 바꾸고 싶다는 생각이 드나요?',
    boundary: '간격만으로 구매 의사나 긴급성을 단정하지 않는다.',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Keenan — GAP Selling', url: 'https://salesgrowth.com/gap-selling-book/' },
  },
  {
    id: 'sales-spin-implication', kind: 'guru', domain: 'sales', person: 'Neil Rackham · SPIN',
    personId: 'neil-rackham', personName: 'Neil Rackham', methodLabel: 'SPIN', rotationEligible: false,
    frame: '고객이 말한 문제의 업무상 영향을 더 깊이 이해하는 Implication 질문 관점',
    text: '고객이 직접 말한 문제에서 출발해 실제 업무 영향이 있는지 묻습니다. 영향이 작다는 답도 판단 재료입니다.',
    useWhen: '고객이 문제는 말했지만 중요도와 우선순위가 불명확할 때',
    question: '말씀하신 문제가 이어질 때 실제로 영향을 받는 업무가 있나요?',
    boundary: '문제를 말하지 않았다면 시사점 질문을 끼워 넣지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'SPIN Selling System · Implication Questions', url: 'https://www.huthwaiteinternational.com/spin-methodology' },
  },
  {
    id: 'sales-voss-feasibility', kind: 'guru', domain: 'sales', person: 'Chris Voss · 실행 조건',
    personId: 'chris-voss', personName: 'Chris Voss', methodLabel: '실행 조건', rotationEligible: false,
    frame: '긍정적인 반응을 실제 실행 조건으로 확인하는 보정 질문 관점',
    text: '좋다는 반응을 시작 약속으로 해석하지 마세요. 실제 진행에 필요한 조건을 상대의 말로 확인합니다.',
    useWhen: '긍정 답변은 있지만 실행 방법이 불명확할 때',
    question: '진행을 검토하신다면 먼저 확인하거나 준비해야 할 조건은 무엇인가요?',
    boundary: '거절 뒤 조건을 캐묻거나 날짜를 잡지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Calibrated Questions', url: 'https://www.blackswanltd.com/newsletter/the-power-of-calibrated-questions-shaping-conversations-with-precision', application: 'adapted', note: 'Black Swan Group의 Derek Gaunt가 쓴 질문 설명을 실행 조건 확인에 한정한 Moonlight 응용; Chris Voss의 직접 글이나 발언으로 인용하지 않음' },
  },
  {
    id: 'sales-ross-fit', kind: 'guru', domain: 'sales', person: 'Aaron Ross · 맞는 고객',
    personId: 'aaron-ross', personName: 'Aaron Ross', methodLabel: '맞는 고객', requiresMatchedContext: true,
    frame: '이상적 고객의 공통 조건과 맞지 않는 조건을 확인하는 ICP 관점',
    text: '과거에 잘 맞았던 고객의 조건은 신규 문의에 던질 질문입니다. 같은 업종이라는 이유만으로 적합하다고 판정하지 않습니다.',
    useWhen: '새로 들어온 문의나 잠재고객의 첫 접촉을 준비할 때',
    question: '이 문의가 기존 적합 고객과 닮은 점과 다른 점은 무엇인가요?',
    boundary: '업종·규모나 한 번의 성공으로 적합 여부를 판정하지 않는다.',
    contexts: ['sales:new'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'ICP — Ideal Customer Profile', url: 'https://predictablerevenue.com/blog/15-minute-summary-of-predictable-revenue/' },
  },
  {
    id: 'sales-ziglar-help', kind: 'guru', domain: 'sales', person: 'Zig Ziglar · 고객 목표',
    personId: 'zig-ziglar', personName: 'Zig Ziglar', methodLabel: '고객 목표',
    frame: '제품 설명보다 고객이 얻고자 하는 결과와 현재 필요를 먼저 이해하는 관점',
    text: '고객이 이번 대화에서 얻고 싶은 결과를 들은 뒤 그 결과와 연결되는 설명만 고르세요.',
    useWhen: '신규 또는 기존 고객과 대화의 목적을 확인하고 싶을 때',
    question: '이번 대화가 끝날 때 어떤 점이 분명해지면 도움이 될까요?',
    boundary: '고객이 원치 않는 도움을 판매 명분으로 밀어붙이지 않는다.',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '올타임 레전드 Vol.1 — Zig Ziglar', url: 'https://www.ziglar.com/show/helping/', application: 'adapted', note: '고객의 필요를 이해하라는 원칙을 현재 대화의 질문으로 바꾼 Moonlight 응용' },
  },
  {
    id: 'sales-carnegie-listen', kind: 'guru', domain: 'sales', person: 'Dale Carnegie · 경청',
    personId: 'dale-carnegie', personName: 'Dale Carnegie', methodLabel: '경청',
    frame: '상대의 관심사를 듣고 상대 관점에서 대화를 이어가는 관계 원칙',
    text: '상대가 중요하다고 말한 내용을 내 해석과 구분해 되짚고, 틀렸다면 바로 고칠 여지를 남기세요.',
    useWhen: '상대가 중요하게 여기는 점을 직접 듣고 확인할 때',
    question: '제가 들은 우선순위는 이것인데, 다르게 이해한 부분이 있나요?',
    boundary: '경청을 동의나 구매 의사로 바꾸지 않는다.',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '올타임 레전드 Vol.2 — Dale Carnegie', url: 'https://www.dalecarnegie.com/en/culture', application: 'adapted', note: '공식 경청·상대 관심사 원칙을 고객 대화의 확인 질문으로 적용한 Moonlight 응용' },
  },
  {
    id: 'sales-hill-purpose', kind: 'guru', domain: 'sales', person: 'Napoleon Hill · 목적 설정',
    personId: 'napoleon-hill', personName: 'Napoleon Hill', methodLabel: '목적 설정', rotationEligible: false,
    frame: '행동 전에 자신의 목적과 계획을 분명히 정하는 자기점검 관점',
    text: '계약 같은 결과 목표 대신 이번 접촉에서 내가 확인할 사실 한 가지를 먼저 적으세요.',
    useWhen: '운영자가 미팅을 준비하지만 목적이 막연할 때',
    question: '이번 대화에서 답을 듣지 못해도 확인해야 할 핵심 질문은 무엇인가요?',
    boundary: '내 목적을 고객의 답변 의무로 바꾸지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '올타임 레전드 Vol.3 — Napoleon Hill', url: 'https://www.naphill.org/shop/books/paperback/napoleon-hills-path-to-purpose-7-steps-to-living-a-life-that-matters/', application: 'adapted', note: '개인의 definite purpose 개념을 영업 미팅 준비에 적용한 Moonlight 응용; 고객 행동이나 성과를 예측하지 않음' },
  },
  {
    id: 'sales-girard-after-sale', kind: 'guru', domain: 'sales', person: 'Joe Girard · 계약 후 관계',
    personId: 'joe-girard', personName: 'Joe Girard', methodLabel: '계약 후 관계', rotationEligible: false,
    frame: '거래 뒤에도 고객이 약속한 지원을 받는지 확인하는 관계 관점',
    text: '계약 뒤에는 연락 횟수보다 약속한 안내·지원이 실제로 닿았는지 확인하세요. 발송과 이용은 다른 상태입니다.',
    useWhen: '기존 고객의 후속 지원 상태를 점검할 때',
    question: '우리가 약속한 지원 중 전달과 실제 이용을 따로 확인해야 할 것은 무엇인가요?',
    boundary: '반복 연락이나 자동 소개 요청으로 쓰지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '올타임 레전드 Vol.4 — Joe Girard', url: 'https://www.joegirard.com/posts/keep-in-touch-with-your-customers/', application: 'adapted', note: '자동 연락이나 반복 발송 대신 기존 약속의 이행을 점검하는 Moonlight 응용' },
  },
  {
    id: 'sales-tracy-needs', kind: 'guru', domain: 'sales', person: 'Brian Tracy · 니즈 확인',
    personId: 'brian-tracy', personName: 'Brian Tracy', methodLabel: '니즈 확인',
    frame: '해법을 제시하기 전에 고객의 실제 필요를 질문으로 확인하는 관점',
    text: '준비한 해법을 설명하기 전에 고객이 우선 해결하려는 일을 고객의 표현으로 확인하세요.',
    useWhen: '고객이 바라는 결과를 직접 확인하고 싶을 때',
    question: '여러 문제 중 지금 먼저 해결하고 싶은 일은 무엇인가요?',
    boundary: '고객의 답을 기다리지 않고 필요를 기능 목록으로 채우지 않는다.',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '올타임 레전드 Vol.5 — Brian Tracy', url: 'https://www.briantracy.com/blog/sales-success/7-key-results-areas-of-sales-success-brian-tracy-certified-sales-trainer/', application: 'adapted', note: '니즈 확인 원칙을 현재 상담의 개방형 질문으로 적용한 Moonlight 응용; 원전의 성과 수치는 채택하지 않음' },
  },
  {
    id: 'sales-cardone-own-effort', kind: 'guru', domain: 'sales', person: 'Grant Cardone · 자기 활동 점검',
    personId: 'grant-cardone', personName: 'Grant Cardone', methodLabel: '자기 활동 점검', rotationEligible: false,
    frame: '목표를 이루는 데 필요한 자신의 준비와 활동을 과소평가하지 않았는지 보는 관점',
    text: '답이 없다고 고객 접촉을 늘리기 전에 내가 약속한 답변·자료·질문 준비에서 빠진 것을 확인하세요.',
    useWhen: '운영자가 자신의 준비와 계획을 점검하고 싶을 때',
    question: '다시 연락하기 전에 내가 보완해야 할 답변이나 자료는 무엇인가요?',
    boundary: '내 활동량은 고객의 응답 의무가 아니며 연락 선호가 우선이다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '현대 구루 Vol.1 — Grant Cardone', url: 'https://grantcardone.com/what-is-the-10x-rule/', application: 'adapted', note: '활동량 점검 관점만 운영자 자기점검으로 제한한 Moonlight 응용; 반복 접촉·압박이나 성과 보장을 권하지 않음' },
  },
  {
    id: 'sales-belfort-fit', kind: 'guru', domain: 'sales', person: 'Jordan Belfort · 적합 고객 선별',
    personId: 'jordan-belfort', personName: 'Jordan Belfort', methodLabel: '적합 고객 선별', rotationEligible: false,
    frame: '관심이나 필요가 맞지 않는 상대에게 억지로 제안하지 않는 적합성 관점',
    text: '고객이 말한 문제와 제공 범위가 맞지 않거나 대화 의사가 없다면 설득 문구 대신 제안 중단을 검토하세요.',
    useWhen: '운영자가 잠재 고객의 적합성을 직접 검토할 때',
    question: '고객이 원한 해결과 우리가 실제 제공할 수 있는 범위는 어디에서 만난다고 확인됐나요?',
    boundary: '유보·침묵을 동의로 해석하거나 거절을 우회하지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '현대 구루 Vol.2 — Jordan Belfort', url: 'https://jb.online/blogs/sales-school/how-to-master-sales-prospecting-sales-school', application: 'adapted', note: '원전의 적합 고객 선별만 채택한 Moonlight 응용; 압박식 설득·클로징은 포함하지 않음' },
  },
  {
    id: 'sales-lemkin-customer-success', kind: 'guru', domain: 'sales', person: 'Jason Lemkin · 고객 성공',
    personId: 'jason-lemkin', personName: 'Jason Lemkin', methodLabel: '고객 성공', rotationEligible: false,
    frame: 'SaaS 계약 이후에도 고객이 서비스를 실제로 활용하고 필요한 지원을 받는지 살피는 관점',
    text: '계약이 완료됐다는 기록과 고객이 서비스를 원하는 방식으로 쓰고 있다는 증거를 나누어 보세요.',
    useWhen: 'SaaS나 반복 서비스 고객의 계약 후 운영을 직접 검토할 때',
    question: '고객이 합의한 목적대로 접근하고 사용하는지, 어느 부분을 확인했나요?',
    boundary: '반복 서비스에만 쓰고 접속 수로 불만을 추정하지 않는다.',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: '테크/SaaS 구루 Vol.2 — Jason Lemkin', url: 'https://www.saastr.com/customer-success-managers-hire-early-and-no-squishy-goals-its-all-about-the-numbers/', application: 'adapted', note: 'SaaS 고객 성공 관점을 반복 서비스 관계에 적용하는 Moonlight 응용; 현재 고객 단계만으로 SaaS 적합성을 판단하지 않음' },
  },
  {
    id: 'marketing-smallest-market', kind: 'guru', domain: 'marketing', person: 'Seth Godin · 가장 작은 고객군',
    personId: 'seth-godin', personName: 'Seth Godin', methodLabel: '가장 작은 고객군',
    frame: '모두가 아니라 먼저 변화가 절실한 작은 고객 집단을 구체화하는 관점',
    text: '모두에게 통하는 문구를 찾기 전에 먼저 도울 작은 고객군과 그들이 원하는 변화를 한 쌍으로 정의하세요.',
    useWhen: '브랜드 소개 문장이 누구에게나 맞는 말처럼 들릴 때',
    question: '가장 먼저 이 변화를 필요로 할 사람은 누구이며, 그 판단의 근거는 무엇인가요?',
    boundary: '시작 집단을 좁혀도 다른 고객을 배제하는 선언은 아니다.',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '세스 고딘', url: 'https://seths.blog/2022/05/the-smallest-viable-audience/' },
  },
  {
    id: 'marketing-research', kind: 'guru', domain: 'marketing', person: 'David Ogilvy · 리서치 우선',
    personId: 'david-ogilvy', personName: 'David Ogilvy', methodLabel: '리서치 우선',
    frame: '표현을 꾸미기 전에 고객의 언어와 확인된 사실을 수집하는 관점',
    text: '표현을 쓰기 전에 고객이 실제로 쓴 말, 현재 제공할 수 있는 사실, 아직 모르는 것을 따로 모으세요.',
    useWhen: '소개 문구는 있지만 근거와 고객 언어가 약할 때',
    question: '이 문구에 넣은 고객 표현은 실제 어디에서, 어떤 맥락에서 들었나요?',
    boundary: '한 번의 관찰을 전체 시장의 목소리로 쓰지 않는다.',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '데이비드 오길비', url: 'https://ogilvy.relayto.com/e/ogilvy-on-advertising-dq85bunnm5ady' },
  },
  {
    id: 'marketing-permission', kind: 'guru', domain: 'marketing', person: 'Seth Godin · 기대하는 메시지',
    personId: 'seth-godin', personName: 'Seth Godin', methodLabel: '기대하는 메시지',
    frame: '받는 사람이 원하고 기대하는 메시지인지 먼저 확인하는 허락 마케팅 관점',
    text: '발송자의 일정이나 채널 수보다 수신자가 이 주제·시점·빈도를 기대할 이유를 먼저 확인하세요.',
    useWhen: '채널이나 발송 빈도를 늘릴지 고민할 때',
    question: '받는 사람이 지금 이 메시지를 요청했거나 기대한다는 신호가 있나요?',
    boundary: '공개 글·직접 메시지를 구분하고 수신 동의도 확인한다.',
    contexts: ['marketing:audience-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '핵심 철학 2 — 허락 마케팅', url: 'https://seths.blog/2008/01/permission-mark/' },
  },
  {
    id: 'marketing-specific-promise', kind: 'guru', domain: 'marketing', person: 'David Ogilvy · 확인 가능한 이점',
    personId: 'david-ogilvy', personName: 'David Ogilvy', methodLabel: '확인 가능한 이점',
    frame: '추상적인 우월성보다 조사로 확인할 수 있는 고객 이점을 앞세우는 관점',
    text: '추상적인 장점 하나를 고객이 직접 확인할 수 있는 이점과 제공 조건으로 바꿔 적으세요.',
    useWhen: '소개 문구가 최고·혁신·효율 같은 말에 머물 때',
    question: '이 이점을 보여 줄 수 있는 현재의 사실과 적용 조건은 무엇인가요?',
    boundary: '측정되지 않은 성과를 모든 고객의 결과로 약속하지 않는다.',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '데이비드 오길비 · 리서치 우선주의', url: 'https://ogilvy.relayto.com/e/ogilvy-on-advertising-dq85bunnm5ady' },
  },
  {
    id: 'marketing-clear-plan', kind: 'guru', domain: 'marketing', person: 'Donald Miller · 쉬운 시작',
    personId: 'donald-miller', personName: 'Donald Miller', methodLabel: '쉬운 시작',
    frame: '고객이 원하는 변화로 가는 첫 단계를 간단히 보여 주는 StoryBrand 계획 관점',
    text: '관심이 생긴 고객이 현재 준비 정도에서 할 수 있는 첫 행동과 그 뒤 실제 절차를 보여 주세요.',
    useWhen: '브랜드 메시지는 있으나 이용 흐름이 막연할 때',
    question: '이 고객이 지금 시작할 수 있는 첫 행동과 그 뒤 받는 정보는 무엇인가요?',
    boundary: '없는 상담·시연·성과를 약속하지 않는다.',
    contexts: ['marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '도날드 밀러 · 4단계: 계획', url: 'https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf' },
  },
  {
    id: 'content-storybrand', kind: 'guru', domain: 'content', person: 'Donald Miller · StoryBrand',
    personId: 'donald-miller', personName: 'Donald Miller', methodLabel: 'StoryBrand',
    frame: '독자가 주인공이고 브랜드는 변화를 돕는 안내자라는 서사 관점',
    text: '첫 문장의 중심을 브랜드 소개에서 독자가 풀고 싶은 과제로 옮기고, 브랜드의 도움은 뒤에서 설명하세요.',
    useWhen: '초안의 첫 문장이 회사나 제품 설명으로 시작할 때',
    question: '독자는 어떤 문제를 안고 이 글에 들어오며, 글은 어디까지 도울 수 있나요?',
    boundary: '독자의 감정이나 성공 결과를 이야기 구조에 맞춰 만들지 않는다.',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '도날드 밀러', url: 'https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf' },
  },
  {
    id: 'content-hook', kind: 'guru', domain: 'content', person: 'Kane Kallaway · 도입부와 재훅',
    personId: 'kane-kallaway', personName: 'Kane Kallaway', methodLabel: '도입부와 재훅',
    frame: '도입부가 연 질문을 본문이 실제로 풀어 주는지 검토하는 관점',
    text: '첫 장이 연 질문을 적어 두고 각 장이 답에 보탬이 되는지 대조하세요. 새 궁금증만 쌓지 않습니다.',
    useWhen: '카드뉴스 첫 장과 본문이 따로 노는 느낌이 들 때',
    question: '마지막 장은 첫 장에서 연 질문에 답하거나 답하지 못한 이유를 밝히나요?',
    boundary: '못 풀 질문으로 끌거나 공지에 긴장을 만들지 않는다.',
    contexts: ['content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Kane Kallaway', url: 'https://podcasts.apple.com/us/podcast/rhythm-hooks-and-a-billion-views-kane-kallaways/id1727260996?i=1000666890786', application: 'adapted', note: '영상의 재훅 원리를 카드뉴스의 첫 장과 본문 관계에 적용한 Moonlight 해석' },
  },
  {
    id: 'content-three-tests', kind: 'guru', domain: 'content', person: 'Harry Dry · 첫 문장 점검',
    personId: 'harry-dry', personName: 'Harry Dry', methodLabel: '첫 문장 점검',
    frame: '한 문장이 그려지는지, 확인 가능한지, 그 브랜드만 말할 수 있는지 묻는 카피 점검 관점',
    text: '첫 문장이 구체적 장면을 만들고, 사실로 확인되며, 다른 브랜드의 말과 구별되는지 각각 점검하세요.',
    useWhen: '제목이나 첫 장이 두루뭉술할 때',
    question: '이 문장을 다른 브랜드 이름으로 바꿔도 그대로 성립하나요?',
    boundary: '세 검사를 통과해도 반응은 보장되지 않는다.',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Harry Dry · 3가지 판정 질문', url: 'https://www.linkedin.com/posts/harrydry_three-tests-for-any-line-you-write-activity-7219696153288683521-ao7k' },
  },
  {
    id: 'content-multiplication', kind: 'guru', domain: 'content', person: 'Justin Welsh · 소재 재사용',
    personId: 'justin-welsh', personName: 'Justin Welsh', methodLabel: '소재 재사용',
    frame: '검증된 생각 하나를 다른 매체의 독자에게 맞춰 다시 구성하는 관점',
    text: '기존 생각의 핵심은 보존하되 새 채널의 독자와 형식에 맞춰 설명 순서와 사례를 다시 고르세요.',
    useWhen: '제작 부담이 커지고 기존 소재가 쌓여 있을 때',
    question: '이 생각에서 반드시 남길 핵심과 새 채널에 맞게 바꿀 설명은 무엇인가요?',
    boundary: '복제·횟수 경쟁을 피하고 비공개 질문은 허용을 확인한다.',
    contexts: ['content:idea'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Justin Welsh · 콘텐츠 운영체제', url: 'https://justinwelsh.me/essays/leverage' },
  },
  {
    id: 'content-perspective', kind: 'guru', domain: 'content', person: 'Dan Koe · 직접 본 관점',
    personId: 'dan-koe', personName: 'Dan Koe', methodLabel: '직접 본 관점',
    frame: '널리 다룬 주제에 자신의 관찰과 사례를 더해 분명한 관점을 만드는 방식',
    text: '흔한 주제에 내가 직접 본 장면을 붙이고, 그 관찰에서 나온 해석과 아직 검증할 제안을 구분하세요.',
    useWhen: '다룰 주제는 있지만 나만의 관점이 약할 때',
    question: '이 주장에 담긴 직접 관찰과 내 해석은 각각 무엇인가요?',
    boundary: '미확인·비공개 사례를 경험처럼 쓰지 않는다.',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Dan Koe', url: 'https://thedankoe.com/letters/how-to-think-originally/' },
  },
];

export const LEGEND_CARDS: readonly GuidanceCard[] = [
  {
    id: 'legend-buffett', kind: 'legend', domain: 'perspective', person: 'Warren Buffett · 집중',
    frame: '능력 범위 안에서 집중하고 유행을 놓치는 비용을 감수하는 판단 관점',
    text: '새 기회를 받아들일 때 내가 이해하고 책임질 범위와 이번 주 포기할 일을 함께 적으세요.',
    useWhen: '새 프로젝트를 시작하기 전에 집중의 비용을 판단할 때',
    question: '이 선택을 하려면 무엇을 내려놓고, 무엇을 더 알아야 하나요?',
    boundary: '낯설다는 이유로 자동 거절하거나 조사만 끝없이 늘리지 않는다.',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'buffett', url: 'https://www.berkshirehathaway.com/letters/1996.html', application: 'adapted', note: '투자에서 말한 능력 범위를 주간 업무 선택에 적용한 Moonlight 해석' },
  },
  {
    id: 'legend-feynman', kind: 'legend', domain: 'perspective', person: 'Richard Feynman · 불리한 근거',
    frame: '내 주장에 불리한 사실과 다른 설명 가능성을 먼저 드러내는 지적 정직성 관점',
    text: '결정을 지지하는 자료 옆에 불리한 근거와 다른 설명을 놓고, 어떤 확인이 결론을 바꿀지 정하세요.',
    useWhen: '익숙한 설명이 반례와 불확실성을 가릴 수 있을 때',
    question: '내 결론에 가장 불리한 사실은 무엇이며, 무엇을 확인하면 생각을 바꾸나요?',
    boundary: '모든 결정을 실험실처럼 증명하려다 실행을 멈추지 않는다.',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'feynman', url: 'https://calteches.library.caltech.edu/3043/' },
  },
  {
    id: 'legend-carnegie', kind: 'legend', domain: 'perspective', person: 'Dale Carnegie · 상대 관점',
    frame: '논쟁에서 이기기보다 상대의 중요감과 관심사를 먼저 듣는 관계 관점',
    text: '이견에서 상대가 지키려는 것을 먼저 확인하되, 경청을 동의나 책임 면제로 바꾸지 마세요.',
    useWhen: '고객과 이견을 풀거나 관계를 회복할 때',
    question: '상대가 중요하게 지키려는 것은 무엇이고, 아직 남는 이견은 무엇인가요?',
    boundary: '경청을 양보나 사실 오류 은폐로 바꾸지 않는다.',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'carnegie', url: 'https://www.dalecarnegie.com/en/culture', application: 'adapted', note: '공식 인간관계 원칙을 고객과의 이견 상황에 적용한 Moonlight 해석' },
  },
];

function seoulDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

const GURU_CHANGE_HOURS = [9, 14, 19] as const;

export function guidanceDailyWindow(now: Date = new Date()): {
  key: string; date: string; slot: 0 | 1 | 2; label: '오전' | '오후' | '저녁'; nextAt: string;
} {
  const localDate = seoulDate(now);
  const localHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23',
  }).format(now));
  // The evening card stays in place through the night. Midnight is not a
  // fourth update, and the same instant selects the same card in every client.
  const slot: 0 | 1 | 2 = localHour < GURU_CHANGE_HOURS[0] || localHour >= GURU_CHANGE_HOURS[2]
    ? 2 : localHour < GURU_CHANGE_HOURS[1] ? 0 : 1;
  const date = localHour < GURU_CHANGE_HOURS[0]
    ? new Date((dayNumber(localDate) - 1) * 86_400_000).toISOString().slice(0, 10)
    : localDate;
  const nextDate = slot === 2
    ? new Date((dayNumber(date) + 1) * 86_400_000).toISOString().slice(0, 10)
    : date;
  const nextHour = slot === 0 ? GURU_CHANGE_HOURS[1] : slot === 1 ? GURU_CHANGE_HOURS[2] : GURU_CHANGE_HOURS[0];
  const nextAt = new Date(Date.parse(`${nextDate}T00:00:00Z`) + (nextHour - 9) * 3_600_000).toISOString();
  return { key: `${date}@${slot}`, date, slot, label: ['오전', '오후', '저녁'][slot] as '오전' | '오후' | '저녁', nextAt };
}

export function guidancePeriodKey(cadence: GuidanceCadence, now: Date = new Date()): string {
  const date = seoulDate(now);
  if (cadence === 'daily') return date;
  const day = dayNumber(date);
  const monday = day - ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7);
  return new Date(monday * 86_400_000).toISOString().slice(0, 10);
}

export function listGuidanceCards({ cadence, domain }: {
  cadence: GuidanceCadence; domain?: GuidanceDomain;
}): readonly GuidanceCard[] {
  return cadence === 'weekly' ? LEGEND_CARDS : GURU_CARDS.filter(card => card.domain === domain);
}

export function listGuidancePeople({ domain }: { domain?: GuidanceDomain } = {}): GuidancePerson[] {
  const people = new Map<string, GuidancePerson>();
  for (const card of GURU_CARDS) {
    if (card.domain === 'perspective' || (domain && card.domain !== domain)) continue;
    const id = card.personId;
    const name = card.personName;
    if (!id || !name) continue;
    const existing = people.get(id);
    if (existing) {
      if (!existing.domains.includes(card.domain)) existing.domains.push(card.domain);
    } else {
      people.set(id, { id, name, domains: [card.domain] });
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function listGuidanceCardsForPerson(personId: string): readonly GuidanceCard[] {
  return GURU_CARDS.filter(card => card.personId === personId);
}

export function selectGuidanceCard({ cadence, domain, now = new Date(), offset = 0, contextKey }: {
  cadence: GuidanceCadence; domain?: GuidanceDomain; now?: Date; offset?: number; contextKey?: string;
}): GuidanceCard {
  const catalogue = listGuidanceCards({ cadence, domain })
    .filter(card => cadence === 'weekly' || card.rotationEligible !== false);
  const matched = cadence === 'daily' && contextKey
    ? catalogue.filter(card => card.contexts?.includes(contextKey)) : [];
  const general = catalogue.filter(card => card.requiresMatchedContext !== true);
  // A situational set must still sustain all three fixed daily windows.
  // Unknown or narrow context falls back to cards safe without a matched signal.
  const cards = matched.length >= 3 ? matched : general;
  if (!cards.length) throw new Error(`No guidance cards for ${cadence}/${domain ?? ''}`);
  const window = cadence === 'daily' ? guidanceDailyWindow(now) : null;
  const seed = window
    ? dayNumber(window.date) * 3 + window.slot
    : dayNumber(guidancePeriodKey(cadence, now));
  const index = ((seed + Math.trunc(offset)) % cards.length + cards.length) % cards.length;
  return cards[index];
}

export function guidancePromptFrame(id: string): string {
  const card = [...GURU_CARDS, ...LEGEND_CARDS].find(item => item.id === id);
  if (!card) return '';
  const application = card.source.application === 'adapted' ? 'Moonlight 응용, 원전의 직접 표현 아님' : '자료 요약, 인용 아님';
  return [
    `참고 방법론(${application}): ${card.person} — ${card.frame}.`,
    `카드 관점: ${card.text}`,
    `이 카드의 추천 적용 상황(Moonlight 편집 기준, 방법론 전체의 적용 시기를 한정하지 않음): ${card.useWhen}.`,
    `카드의 예시 질문(적용 조건이 맞을 때만 참고): ${card.question}`,
    `적용하지 않을 조건: ${card.boundary}`,
    card.source.note ? `응용 범위: ${card.source.note}.` : '',
    `출처 메타데이터: ${card.source.path} §${card.source.section}; ${card.source.url || '원전 URL 미확인'}.`,
    '원전 본문을 직접 읽은 것으로 주장하지 마십시오. 현재 원장 사실과 분리하고 상황에 맞을 때만 적용하십시오.',
  ].filter(Boolean).join(' ');
}

// A prior card is provenance for a follow-up, never a sticky selection. Both
// Hub context scoping and Engine prompting use this decision so they cannot
// disagree about whether the current question refers to the previous card.
export function referencedPriorCardId(draft: string | null | undefined, history: unknown): string | null {
  if (typeof draft !== 'string' || !Array.isArray(history)) return null;
  const text = draft.trim().toLowerCase();
  if (!text) return null;
  const turns = history.slice(-3);
  const salesCardForTurn = (turn: unknown) => {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) return null;
    const id = (turn as { guidanceId?: unknown }).guidanceId;
    return typeof id === 'string' ? GURU_CARDS.find(card => card.domain === 'sales' && card.id === id) || null : null;
  };
  for (const turn of [...turns].reverse()) {
    const card = salesCardForTurn(turn);
    if (!card) continue;
    const person = card.personName?.toLowerCase();
    const method = card.methodLabel?.toLowerCase();
    if ((person && text.includes(person))
      || (method && /^[a-z0-9 ]{4,}$/.test(method) && text.includes(method))) return card.id;
  }
  const latest = salesCardForTurn(turns.at(-1));
  return latest && /(?:방금|아까|그)\s*(?:카드|관점|프레임|방법론|답변|질문)/.test(draft)
    ? latest.id : null;
}
