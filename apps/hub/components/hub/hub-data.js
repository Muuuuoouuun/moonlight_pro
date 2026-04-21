// Navigation + sample data for Moonlight Pro Hub
// Design's NAV_TREE on top; existing-but-non-overlapping routes consolidated
// into a bottom "기타" (Archive / Legacy) group.

export const NAV_TREE = [
  { key: 'daily-brief', label: 'Daily Brief', icon: 'brief', path: 'dashboard/daily-brief' },
  {
    key: 'work', label: 'Work', icon: 'work',
    children: [
      { key: 'calendar',  label: 'Calendar',  icon: 'calendar',  path: 'dashboard/work/calendar' },
      { key: 'projects',  label: 'Projects',  icon: 'projects',  path: 'dashboard/work/projects' },
      { key: 'decisions', label: 'Decisions', icon: 'decisions', path: 'dashboard/work/decisions' },
      { key: 'roadmap',   label: 'Roadmap',   icon: 'roadmap',   path: 'dashboard/work/roadmap' },
      { key: 'rhythm',    label: 'Rhythm',    icon: 'rhythm',    path: 'dashboard/work/rhythm' },
    ],
  },
  {
    key: 'content', label: 'Content', icon: 'content',
    children: [
      { key: 'studio',    label: 'Studio',    icon: 'studio',    path: 'dashboard/content/studio' },
      { key: 'queue',     label: 'Queue',     icon: 'queue',     path: 'dashboard/content/queue' },
      { key: 'campaigns', label: 'Campaigns', icon: 'campaigns', path: 'dashboard/content/campaigns' },
    ],
  },
  {
    key: 'revenue', label: 'Revenue', icon: 'revenue',
    children: [
      { key: 'overview', label: 'Overview', icon: 'revenue',  path: 'dashboard/revenue/overview' },
      { key: 'leads',    label: 'Leads',    icon: 'leads',    path: 'dashboard/revenue/leads' },
      { key: 'deals',    label: 'Deals',    icon: 'deals',    path: 'dashboard/revenue/deals' },
      { key: 'cases',    label: 'Cases',    icon: 'cases',    path: 'dashboard/revenue/cases' },
      { key: 'accounts', label: 'Accounts', icon: 'accounts', path: 'dashboard/revenue/accounts' },
    ],
  },
  {
    key: 'automations', label: 'Automations', icon: 'automations',
    children: [
      { key: 'flows',    label: 'Flows',    icon: 'zap',     path: 'dashboard/automations/flows' },
      { key: 'email',    label: 'Email',    icon: 'email',   path: 'dashboard/automations/email' },
      { key: 'webhooks', label: 'Webhooks', icon: 'webhook', path: 'dashboard/automations/webhooks' },
      { key: 'runs',     label: 'Runs',     icon: 'runs',    path: 'dashboard/automations/runs' },
    ],
  },
  {
    key: 'agents', label: 'Agents', icon: 'agents',
    children: [
      { key: 'chat',    label: 'Chat',      icon: 'chat',    path: 'dashboard/agents/chat' },
      { key: 'council', label: 'Council',   icon: 'council', path: 'dashboard/agents/council' },
      { key: 'orders',  label: 'Orders',    icon: 'orders',  path: 'dashboard/agents/orders' },
      { key: 'office',  label: 'VR Office', icon: 'agents',  path: 'dashboard/agents/office' },
    ],
  },
  { key: 'evolution', label: 'Evolution', icon: 'evolution', path: 'dashboard/evolution' },
  { key: 'settings',  label: 'Settings',  icon: 'settings',  path: 'dashboard/settings' },
];

// 기타 (Archive) — empty: every legacy concept is now folded into the
// canonical Moonlight Pro sections. Old direct URLs still resolve via the
// LegacyPlaceholder so deep links don't 404, but nothing surfaces in the nav.
export const LEGACY_TREE = [];

// Map old standalone routes → their new home. Used by LegacyPlaceholder
// to point users at the canonical destination.
export const LEGACY_REDIRECTS = {
  'dashboard/work/management':            { to: 'dashboard/work/projects', label: 'Projects (PMS 통합)' },
  'dashboard/work/plan':                  { to: 'dashboard/work/roadmap',  label: 'Roadmap' },
  'dashboard/work/releases':              { to: 'dashboard/evolution',     label: 'Evolution · Log' },
  'dashboard/work/pms':                   { to: 'dashboard/work/projects', label: 'Projects' },
  'dashboard/content/assets':             { to: 'dashboard/content/studio', label: 'Studio' },
  'dashboard/content/publish':            { to: 'dashboard/content/queue', label: 'Queue' },
  'dashboard/automations/integrations':   { to: 'dashboard/settings',      label: 'Settings · Integrations' },
  'dashboard/operations':                 { to: 'dashboard/daily-brief',   label: 'Daily Brief' },
  'dashboard/pms':                        { to: 'dashboard/work/projects', label: 'Projects' },
  'dashboard/playbooks':                  { to: 'dashboard/evolution',     label: 'Evolution · Playbooks' },
  'dashboard/command-center':             { to: 'dashboard/evolution',     label: 'Evolution · Commands' },
  'dashboard/command':                    { to: 'dashboard/evolution',     label: 'Evolution · Commands' },
  'dashboard/card-news':                  { to: 'dashboard/content/studio', label: 'Studio (Carousel)' },
  'dashboard/logs':                       { to: 'dashboard/automations/runs', label: 'Run log' },
  'dashboard/routine':                    { to: 'dashboard/work/rhythm',   label: 'Rhythm' },
  'dashboard/evolution/activity':         { to: 'dashboard/evolution',     label: 'Evolution' },
  'dashboard/evolution/issues':           { to: 'dashboard/evolution',     label: 'Evolution' },
  'dashboard/evolution/logs':             { to: 'dashboard/evolution',     label: 'Evolution · Log' },
  'dashboard/projects':                   { to: 'dashboard/work/projects', label: 'Projects' },
};

export const BRIEF_SIGNALS = [
  { id: 's1', tone: 'danger', kind: 'Revenue',
    title: '클래스인 — Spring Cohort 계약서 응답 2일째 지연',
    summary: '계약 단계에서 리드 타임이 평균 대비 48시간 초과. 다음 단계 진행 확률이 하락 중.',
    meta: 'Deal · ₩18.0M · Procurement',
    source: { from: 'Deals', ref: 'DEAL-031' },
    decisions: [
      { label: '리마인드 메일 초안 생성', primary: true, action: 'draft' },
      { label: '상사 에스컬레이션', action: 'escalate' },
      { label: '24시간 더 기다림', action: 'wait' },
    ] },
  { id: 's2', tone: 'warning', kind: 'Content',
    title: '뉴스레터 #47 발행 예정 — 초안 상태 4시간 남음',
    summary: '오늘 18:00 발행 예약. 본문 2번 섹션 미완. 이미지 2/3 업로드.',
    meta: 'Queue · scheduled 18:00',
    source: { from: 'Content Queue', ref: 'NL-047' },
    decisions: [
      { label: 'Studio에서 이어쓰기', primary: true, action: 'write' },
      { label: '발행 내일로 연기', action: 'delay' },
    ] },
  { id: 's3', tone: 'success', kind: 'Automation',
    title: 'Gmail → CRM 자동연결 지난밤 17건 처리',
    summary: '신규 리드 6건, 기존 대화 11건. 태그 누락 2건은 검토 필요.',
    meta: 'Runs · 17/17 succeeded',
    source: { from: 'Automations', ref: 'FLOW-004' },
    decisions: [
      { label: '누락 태그 검토', primary: true, action: 'review' },
      { label: '로그 넘기기', action: 'dismiss' },
    ] },
  { id: 's4', tone: 'info', kind: 'Agent',
    title: 'Council이 다음 주 로드맵 초안을 제안했습니다',
    summary: '3개 주제 우선순위화: 온보딩 개선 · 가격 실험 · 파트너 레퍼럴. 근거 12개 인용.',
    meta: 'Agent · Council · 2h ago',
    source: { from: 'Agents', ref: 'COUNCIL-12' },
    decisions: [
      { label: '로드맵에 반영', primary: true, action: 'accept' },
      { label: '대화에서 계속', action: 'chat' },
      { label: '보류', action: 'hold' },
    ] },
  { id: 's5', tone: 'warning', kind: 'Rhythm',
    title: '금요일 Weekly Review 아직 시작 안됨',
    summary: '이번 주 4/5 리듬 루틴 완료. Review만 미완.',
    meta: 'Rhythm · 3일 연속 skip',
    source: { from: 'Rhythm', ref: 'RHY-wk' },
    decisions: [
      { label: '15분 타이머로 지금', primary: true, action: 'start' },
      { label: '주말로 연기', action: 'delay' },
    ] },
];

export const TODAY_BLOCKS = [
  { time: '09:00', title: 'Daily Brief 리뷰', kind: 'Ritual', done: true },
  { time: '10:00', title: '클래스인 Kim 대표 — Discovery', kind: 'Meeting', tag: 'company' },
  { time: '11:30', title: '뉴스레터 #47 마감', kind: 'Deep work', tag: null },
  { time: '14:00', title: 'Moonlight Web 랜딩 개선', kind: 'Deep work', tag: null },
  { time: '16:00', title: '개인 코칭 — Jihoon', kind: 'Meeting', tag: 'personal' },
  { time: '18:00', title: '뉴스레터 자동 발행', kind: 'Automation', tag: null },
];

export const METRICS = [
  { label: 'MRR', value: '₩8.4M', delta: '+12%', tone: 'success', spark: [2,3,2,4,3,5,4,6,5,7,6,8] },
  { label: 'Pipeline', value: '₩64.2M', delta: '+₩18M', tone: 'success', spark: [4,5,4,6,5,7,6,7,8,7,8,9] },
  { label: 'Leads (30d)', value: '47', delta: '−8%', tone: 'warning', spark: [6,5,6,4,5,4,3,4,3,4,3,3] },
  { label: 'Published', value: '12', delta: 'on track', tone: 'neutral', spark: [2,3,3,4,4,5,5,5,6,6,6,6] },
];

export const KANBAN_COLUMNS = [
  { key: 'backlog', label: 'Backlog', cards: [
    { id: 'k1', title: '도메인 이메일 세팅 (moonlight.pro)', tag: null, priority: 'low', project: 'Moonlight Web v2' },
    { id: 'k2', title: '클래스인 프로포절 v3', tag: 'company', priority: 'med', project: 'Spring Cohort' },
    { id: 'k3', title: '주간 회고 템플릿 업데이트', tag: 'personal', priority: 'low', project: 'Rhythm' },
  ]},
  { key: 'today', label: 'Today', cards: [
    { id: 'k4', title: '뉴스레터 #47 본문 완성', tag: null, priority: 'high', project: 'Newsletter', due: 'Today 18:00' },
    { id: 'k5', title: 'Kim 대표 Discovery 10:00', tag: 'company', priority: 'high', project: 'Spring Cohort' },
    { id: 'k6', title: '랜딩 히어로 카피 2안', tag: null, priority: 'med', project: 'Moonlight Web v2' },
  ]},
  { key: 'doing', label: 'In Progress', cards: [
    { id: 'k7', title: 'Gmail 태그 규칙 튜닝', tag: null, priority: 'med', project: 'Automations' },
    { id: 'k8', title: '가격 실험 가설 문서', tag: null, priority: 'med', project: 'Pricing Q2' },
  ]},
  { key: 'review', label: 'Review', cards: [
    { id: 'k9', title: '뉴스레터 파이프라인 — Council 검토', tag: null, priority: 'med', project: 'Newsletter Auto' },
  ]},
  { key: 'done', label: 'Done', cards: [
    { id: 'k10', title: 'Daily Brief 브리핑 규칙 v2', tag: null, priority: 'low', project: 'Rituals' },
    { id: 'k11', title: '개인 홈 도메인 결정', tag: 'personal', priority: 'low', project: 'Personal Brand' },
  ]},
];

export const DECISIONS = [
  { id: 'd1', title: '가격 체계 티어 3→2로 축소', date: '4월 14일', status: 'Committed', by: 'Me + Council', reason: '전환 분석 결과 중간 티어 이탈률 38%', links: 2 },
  { id: 'd2', title: '클래스인 계약 범위 2차 협상 수용', date: '4월 12일', status: 'Committed', by: 'Me', reason: '장기 레퍼런스 가치 > 단기 마진', links: 3 },
  { id: 'd3', title: '뉴스레터 발행을 주1회로 축소', date: '4월 9일', status: 'Trial (4w)', by: 'Me', reason: '품질>빈도 실험', links: 1 },
  { id: 'd4', title: 'Notion에서 내부 Hub로 프로젝트 이전', date: '4월 2일', status: 'Committed', by: 'Me', reason: '컨텍스트 파편화', links: 5 },
];

export const RITUALS = [
  { id: 'r1', name: 'Daily Brief · 07:00', streak: 23, weeks: [1,1,1,1,1,1,1] },
  { id: 'r2', name: 'Deep work block · 14:00', streak: 12, weeks: [1,1,1,0,1,1,1] },
  { id: 'r3', name: 'Weekly Review · 금', streak: 3, weeks: [1,1,1,1,0,0,0] },
  { id: 'r4', name: 'Monthly retrospective', streak: 4, weeks: [1,1,1,1,0,0,0] },
  { id: 'r5', name: 'Evening shutdown · 22:00', streak: 8, weeks: [1,0,1,1,1,1,0] },
];

export const LEADS = [
  { id: 'l1', name: '클래스인 — 김지수 대표', type: 'company', source: 'Referral', stage: 'Qualified', value: '₩18M', last: '2일 전', owner: 'Me' },
  { id: 'l2', name: '이재민 (개인 코칭)', type: 'personal', source: 'Newsletter', stage: 'New', value: '₩1.2M', last: '오늘', owner: 'Me' },
  { id: 'l3', name: 'Studio Park — 박소연', type: 'company', source: 'Website', stage: 'Contact', value: '₩6M', last: '3일 전', owner: 'Me' },
  { id: 'l4', name: '정하윤 (프리랜서 자문)', type: 'personal', source: 'LinkedIn', stage: 'Qualified', value: '₩900K', last: '어제', owner: 'Me' },
  { id: 'l5', name: 'Beanly Coffee — 홍지민', type: 'company', source: 'Event', stage: 'New', value: '₩4.2M', last: '오늘', owner: 'Council' },
  { id: 'l6', name: 'Han 스튜디오', type: 'company', source: 'Website', stage: 'Contact', value: '₩3.5M', last: '5일 전', owner: 'Me' },
];

export const DEAL_STAGES = [
  { key: 'lead', label: 'Lead', color: 'neutral' },
  { key: 'qual', label: 'Qualified', color: 'info' },
  { key: 'prop', label: 'Proposal', color: 'moon' },
  { key: 'neg',  label: 'Negotiation', color: 'warning' },
  { key: 'won',  label: 'Won', color: 'success' },
];

export const DEALS = [
  { id: 'DEAL-031', name: '클래스인 Spring Cohort', type: 'company',  stage: 'neg',  value: 18000000, owner: 'Me',      close: '5월 12일', age: 14 },
  { id: 'DEAL-029', name: 'Studio Park 리브랜딩',    type: 'company',  stage: 'prop', value: 6000000,  owner: 'Me',      close: '5월 28일', age: 8 },
  { id: 'DEAL-027', name: '이재민 개인 코칭 3mo',    type: 'personal', stage: 'qual', value: 1200000,  owner: 'Me',      close: '4월 말',  age: 2 },
  { id: 'DEAL-025', name: 'Beanly Coffee 온라인 전략', type: 'company', stage: 'lead', value: 4200000, owner: 'Council', close: '6월',     age: 1 },
  { id: 'DEAL-022', name: '정하윤 자문',             type: 'personal', stage: 'qual', value: 900000,   owner: 'Me',      close: '5월 초',  age: 4 },
  { id: 'DEAL-018', name: 'Han 스튜디오',            type: 'company',  stage: 'prop', value: 3500000,  owner: 'Me',      close: '5월 15일', age: 11 },
  { id: 'DEAL-014', name: '베어브릭 콜라보',          type: 'company',  stage: 'won',  value: 7800000,  owner: 'Me',      close: '4월 1일',  age: 32 },
];

export const CONTENT_QUEUE = [
  { id: 'c1', title: '뉴스레터 #47 — 4월 둘째 주',       kind: 'Newsletter', channel: 'Email',     status: 'Draft',     when: '오늘 18:00', author: 'Me' },
  { id: 'c2', title: '1인 창업자의 운영 OS 만들기',      kind: 'Blog',       channel: 'Web',       status: 'Scheduled', when: '4/21 10:00',  author: 'Me' },
  { id: 'c3', title: 'Moonlight 대시보드 스크린샷 릴',   kind: 'Reel',       channel: 'Instagram', status: 'Review',    when: '4/20 12:00',  author: 'Me' },
  { id: 'c4', title: '가격 실험 회고',                   kind: 'Blog',       channel: 'Web',       status: 'Idea',      when: '미정',        author: 'Me' },
  { id: 'c5', title: '뉴스레터 #48 — 4월 셋째 주',       kind: 'Newsletter', channel: 'Email',     status: 'Outline',   when: '4/25 18:00',  author: 'Me' },
  { id: 'c6', title: 'Thread — 결정 기록하기',           kind: 'Thread',     channel: 'X',         status: 'Scheduled', when: '4/19 09:00',  author: 'Council' },
];

export const CAMPAIGNS = [
  { id: 'cm1', name: 'Spring Cohort 오픈',       status: 'Active',   channels: ['Email','Web','X'], progress: 60, end: '5월 10일', goal: '신청 40', current: 24 },
  { id: 'cm2', name: '개인 브랜드 사이트 런칭',  status: 'Planning', channels: ['X','Newsletter'],   progress: 15, end: '6월 초',  goal: '구독자 +200', current: 12 },
  { id: 'cm3', name: '연말 회고 시리즈',         status: 'Draft',    channels: ['Newsletter'],       progress: 5,  end: '12월',    goal: '회고 4편', current: 0 },
];

export const AUTOMATIONS = [
  { id: 'a1', name: 'Gmail → CRM 리드 태깅',       trigger: 'Email received',       status: 'Active', lastRun: '3분 전',    runs24: 17, success: 15 },
  { id: 'a2', name: '뉴스레터 발행 → Resend',       trigger: 'Schedule · 18:00',     status: 'Active', lastRun: '어제',      runs24: 1,  success: 1 },
  { id: 'a3', name: 'Webhook → Stripe 결제 확인',   trigger: 'Webhook',              status: 'Active', lastRun: '1시간 전',  runs24: 4,  success: 4 },
  { id: 'a4', name: '브리핑 요약 06:30',             trigger: 'Schedule · 06:30',     status: 'Active', lastRun: '오늘 아침', runs24: 1,  success: 1 },
  { id: 'a5', name: '계약 서명 완료 → Slack',        trigger: 'Webhook',              status: 'Paused', lastRun: '6일 전',    runs24: 0,  success: 0 },
];

export const RUN_LOG = [
  { id: 'r1', at: '16:24:02', flow: 'Gmail → CRM',    status: 'ok',   ms: 412,  detail: '2 leads tagged' },
  { id: 'r2', at: '16:10:55', flow: 'Gmail → CRM',    status: 'ok',   ms: 389,  detail: '1 thread linked' },
  { id: 'r3', at: '15:58:10', flow: 'Stripe Webhook', status: 'ok',   ms: 156,  detail: 'payment succeeded' },
  { id: 'r4', at: '15:41:33', flow: 'Gmail → CRM',    status: 'warn', ms: 522,  detail: 'tag guess low-confidence' },
  { id: 'r5', at: '14:02:01', flow: 'Gmail → CRM',    status: 'ok',   ms: 401,  detail: '3 leads tagged' },
  { id: 'r6', at: '13:12:47', flow: 'Brief Summary',  status: 'err',  ms: 1812, detail: 'LLM timeout — retry ok at 13:13' },
  { id: 'r7', at: '12:00:00', flow: 'Gmail → CRM',    status: 'ok',   ms: 398,  detail: '1 lead tagged' },
];

export const CHAT_THREAD = [
  { role: 'user', text: '오늘 뉴스레터 #47 마감인데, 2번 섹션 방향을 좀 좁혀줘. 주제는 "결정 기록하기".' },
  { role: 'agent', name: 'Studio', text: '좋은 각도 3개 제안:\n1) 결정 노트의 구조 (맥락·선택·근거·회고)\n2) 취소된 결정도 남기는 이유\n3) 주간 리뷰에서 결정 로그 읽기\n\n1번이 구독자 조사에서 요청이 가장 많았음. 이걸로 쓸까요?' },
  { role: 'user', text: '1번으로 가자. 700자 안쪽, 예시 하나.' },
  { role: 'agent', name: 'Studio', text: '초안 준비했습니다. Studio에서 열어볼게요. →', hasAction: true },
];

export const COUNCIL = [
  { key: 'strategist', label: 'Strategist', role: '장기·우선순위', tone: 'moon',     last: '5월 플랜 초안 제시' },
  { key: 'analyst',    label: 'Analyst',    role: '데이터 해석',   tone: 'info',     last: '리드 출처 분석 완료' },
  { key: 'writer',     label: 'Writer',     role: '콘텐츠·카피',   tone: 'moon',     last: '뉴스레터 2번 섹션 초안' },
  { key: 'operator',   label: 'Operator',   role: '자동화·프로세스', tone: 'warning', last: 'Gmail 태그 규칙 튜닝 제안' },
  { key: 'coach',      label: 'Coach',      role: '리듬·회고',     tone: 'personal', last: '금요일 리뷰 리마인드' },
];

export const ORDERS = [
  { id: 'o1', at: '오늘 06:30', to: 'Writer',     what: '뉴스레터 #47 2번 섹션 초안', status: 'done' },
  { id: 'o2', at: '오늘 06:30', to: 'Analyst',    what: '어제 리드 17건 태그 리뷰',    status: 'done' },
  { id: 'o3', at: '어제 18:00', to: 'Operator',   what: 'Gmail 태그 규칙 튜닝안',      status: 'review' },
  { id: 'o4', at: '어제 09:00', to: 'Strategist', what: '5월 로드맵 1차 초안',          status: 'done' },
  { id: 'o5', at: '어제 09:00', to: 'Coach',      what: '이번 주 루틴 상태 체크',      status: 'done' },
  { id: 'o6', at: '2일 전',    to: 'Writer',     what: '클래스인 프로포절 v3',          status: 'draft' },
];

export const EVOLUTION_LOG = [
  { at: '오늘 07:12', type: 'system', tag: 'upgrade', msg: 'Daily Brief 룰셋 v2.3 — 신호 우선순위에 "연속 skip" 반영' },
  { at: '어제 22:40', type: 'issue',  tag: 'bug',     msg: 'Run log에서 LLM timeout 1건 — 자동 재시도 성공' },
  { at: '어제 11:08', type: 'system', tag: 'insight', msg: 'Council: 지난 2주 리드 중 레퍼럴 전환율 3배. 레퍼럴 양식 개선 제안' },
  { at: '2일 전',     type: 'user',   tag: 'note',    msg: '"주1회 뉴스레터" 4주 실험 시작 — 결정 d3' },
  { at: '3일 전',     type: 'issue',  tag: 'bug',     msg: 'Gmail 태그 규칙 false-positive 2건, 규칙에 회사 도메인 블록 추가' },
  { at: '5일 전',     type: 'system', tag: 'upgrade', msg: 'Agents Orders — 검토 단계 추가 (draft → review → done)' },
];

export const BRANDS = [
  { key: 'all',             name: '전체 브랜드',       glyph: '◐',  tone: 'moon',     kind: 'index',    desc: '모든 프로젝트' },
  { key: 'sinabro',         name: '시나브로',          glyph: '📖', tone: 'info',     kind: 'content',  desc: '출판·콘텐츠 레이블',        projects: 4, tasks: 9,  open: 3, changes: 2 },
  { key: 'gore',            name: '고래 (Go;Re)',      glyph: '🐋', tone: 'company',  kind: 'product',  desc: '회복·리커버리 프로덕트',    projects: 3, tasks: 7,  open: 4, changes: 5 },
  { key: 'holyfuncollector',name: 'HolyFunCollector',  glyph: '✨', tone: 'warning',  kind: 'community',desc: '수집·굿즈 커뮤니티',        projects: 2, tasks: 5,  open: 2, changes: 0 },
  { key: 'bridgemaker',     name: 'BridgeMaker',       glyph: '🌉', tone: 'moon',     kind: 'agency',   desc: '컨설팅·파트너 브릿지',      projects: 5, tasks: 14, open: 6, changes: 8 },
  { key: 'moonpm',          name: 'MoonPM',            glyph: '📁', tone: 'warning',  kind: 'tool',     desc: 'PM 툴킷 (이 허브)',         projects: 3, tasks: 8,  open: 5, changes: 3 },
  { key: 'classmoon',       name: 'Class.Moon',        glyph: '🎓', tone: 'info',     kind: 'education',desc: '교육·코호트',                projects: 2, tasks: 6,  open: 3, changes: 1 },
  { key: 'studyseagull',    name: 'Study.Seagull',     glyph: '🎯', tone: 'danger',   kind: 'education',desc: '학습 공동체',                projects: 2, tasks: 4,  open: 1, changes: 0 },
  { key: 'politicofficer',  name: 'Politic_Officer',   glyph: '🔎', tone: 'info',     kind: 'research', desc: '공공·시민 리서치',          projects: 1, tasks: 3,  open: 2, changes: 4 },
  { key: '22nomad',         name: '22th.Nomad',        glyph: '📄', tone: 'personal', kind: 'personal', desc: '개인 블로그·메모',          projects: 1, tasks: 2,  open: 1, changes: 0 },
];

export const BRAND_PROJECTS = [
  { id: 'sb-1', brand: 'sinabro', name: '시나브로 월간 레터 v3', status: 'In progress', progress: 58, due: '5월 초',   owner: 'Me',     tag: null,       tasks: 8,  done: 4 },
  { id: 'sb-2', brand: 'sinabro', name: '첫 단행본 편집',        status: 'Review',      progress: 82, due: '5월 20일', owner: 'Writer', tag: null,       tasks: 6,  done: 5 },
  { id: 'sb-3', brand: 'sinabro', name: '에세이 공모 캠페인',    status: 'Planning',    progress: 20, due: '6월',      owner: 'Me',     tag: 'company',  tasks: 5,  done: 1 },
  { id: 'sb-4', brand: 'sinabro', name: '홈페이지 리뉴얼',       status: 'Backlog',     progress: 8,  due: '6월 말',   owner: 'Me',     tag: null,       tasks: 4,  done: 0 },
  { id: 'go-1', brand: 'gore',    name: 'Go;Re 앱 베타',         status: 'In progress', progress: 66, due: '5월 15일', owner: 'Me',     tag: 'company',  tasks: 12, done: 8 },
  { id: 'go-2', brand: 'gore',    name: '리커버리 가이드 시즌1', status: 'In progress', progress: 40, due: '5월 말',   owner: 'Writer', tag: null,       tasks: 7,  done: 3 },
  { id: 'go-3', brand: 'gore',    name: '브랜드 톤 가이드',      status: 'Review',      progress: 90, due: '4월 25일', owner: 'Council',tag: null,       tasks: 3,  done: 3 },
  { id: 'hf-1', brand: 'holyfuncollector', name: '드랍 #03 기획',         status: 'In progress', progress: 55, due: '5월 3일',  owner: 'Me', tag: null,       tasks: 6, done: 3 },
  { id: 'hf-2', brand: 'holyfuncollector', name: '디스코드 운영 리뉴얼',   status: 'Backlog',     progress: 10, due: '6월',      owner: 'Me', tag: null,       tasks: 3, done: 0 },
  { id: 'bm-1', brand: 'bridgemaker', name: '클래스인 Spring Cohort',     status: 'In progress', progress: 45, due: '5월 12일', owner: 'Me',     tag: 'company', tasks: 22, done: 10 },
  { id: 'bm-2', brand: 'bridgemaker', name: 'Studio Park 리브랜딩',        status: 'In progress', progress: 55, due: '5월 28일', owner: 'Me',     tag: 'company', tasks: 9,  done: 5 },
  { id: 'bm-3', brand: 'bridgemaker', name: 'Beanly 디지털 전략',          status: 'Planning',    progress: 15, due: '6월',      owner: 'Council',tag: 'company', tasks: 6,  done: 1 },
  { id: 'bm-4', brand: 'bridgemaker', name: '파트너 레퍼럴 프로그램',      status: 'In progress', progress: 35, due: '5월 말',   owner: 'Me',     tag: null,      tasks: 8,  done: 3 },
  { id: 'bm-5', brand: 'bridgemaker', name: '에이전시 내부 플레이북',      status: 'Review',      progress: 75, due: '4월 30일', owner: 'Me',     tag: null,      tasks: 5,  done: 4 },
  { id: 'pm-1', brand: 'moonpm', name: 'Moonlight Web v2',           status: 'In progress', progress: 72, due: '5월 3일',   owner: 'Me',      tag: null, tasks: 18, done: 13 },
  { id: 'pm-2', brand: 'moonpm', name: '뉴스레터 자동화 파이프라인',  status: 'Review',      progress: 90, due: '4월 22일',  owner: 'Council', tag: null, tasks: 11, done: 10 },
  { id: 'pm-3', brand: 'moonpm', name: 'Agents Orders v3',           status: 'Planning',    progress: 25, due: '5월 말',    owner: 'Me',      tag: null, tasks: 7,  done: 2 },
  { id: 'cm-1', brand: 'classmoon', name: '1인 창업자 OS 코호트',     status: 'In progress', progress: 60, due: '5월 중순', owner: 'Me', tag: null, tasks: 10, done: 6 },
  { id: 'cm-2', brand: 'classmoon', name: '강의 촬영 스튜디오 세팅',  status: 'Backlog',     progress: 5,  due: '6월',      owner: 'Me', tag: null, tasks: 4,  done: 0 },
  { id: 'ss-1', brand: 'studyseagull', name: '스터디 시즌2 운영',        status: 'In progress', progress: 48, due: '6월', owner: 'Me', tag: null, tasks: 6, done: 3 },
  { id: 'ss-2', brand: 'studyseagull', name: '독서 클럽 자료 아카이빙',  status: 'Backlog',     progress: 10, due: '7월', owner: 'Me', tag: null, tasks: 3, done: 0 },
  { id: 'po-1', brand: 'politicofficer', name: '지방선거 데이터 핸드북', status: 'In progress', progress: 30, due: '5월 말', owner: 'Analyst', tag: null, tasks: 5, done: 1 },
  { id: 'nm-1', brand: '22nomad', name: '개인 브랜드 사이트', status: 'Backlog', progress: 10, due: '6월', owner: 'Me', tag: 'personal', tasks: 9, done: 1 },
];

export const BRAND_TODOS = [
  { id: 't-sb-1', brand: 'sinabro', project: 'sb-1', title: '이번주 오프닝 에세이 초안', due: '오늘',   done: false, priority: 'high', assignee: 'Me' },
  { id: 't-sb-2', brand: 'sinabro', project: 'sb-1', title: '구독자 설문 응답 정리',    due: '내일',   done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-sb-3', brand: 'sinabro', project: 'sb-2', title: '교정 2차 반영',            due: '4/22',   done: false, priority: 'high', assignee: 'Writer' },
  { id: 't-sb-4', brand: 'sinabro', project: 'sb-3', title: '심사위원 2인 섭외',        due: '다음주', done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-go-1', brand: 'gore',    project: 'go-1', title: '온보딩 4번째 화면 UX',      due: '오늘',   done: false, priority: 'high', assignee: 'Me' },
  { id: 't-go-2', brand: 'gore',    project: 'go-1', title: 'TestFlight 빌드 업로드',    due: '내일',   done: false, priority: 'high', assignee: 'Me' },
  { id: 't-go-3', brand: 'gore',    project: 'go-2', title: '회차 3 아웃라인',           due: '4/21',   done: true,  priority: 'med',  assignee: 'Writer' },
  { id: 't-go-4', brand: 'gore',    project: 'go-2', title: '인터뷰이 2명 예약',         due: '4/23',   done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-hf-1', brand: 'holyfuncollector', project: 'hf-1', title: '콜라보 아티스트 컨택',  due: '오늘', done: false, priority: 'high', assignee: 'Me' },
  { id: 't-hf-2', brand: 'holyfuncollector', project: 'hf-1', title: '드랍 랜딩 와이어프레임', due: '내일', done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-bm-1', brand: 'bridgemaker', project: 'bm-1', title: 'Kim 대표 계약 리마인드', due: '오늘',   done: false, priority: 'high', assignee: 'Me' },
  { id: 't-bm-2', brand: 'bridgemaker', project: 'bm-1', title: '온보딩 자료 초안',       due: '4/21',   done: false, priority: 'high', assignee: 'Writer' },
  { id: 't-bm-3', brand: 'bridgemaker', project: 'bm-2', title: 'Studio Park 무드보드',   due: '4/22',   done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-bm-4', brand: 'bridgemaker', project: 'bm-4', title: '레퍼럴 링크 추적 지표',  due: '이번주', done: false, priority: 'med',  assignee: 'Analyst' },
  { id: 't-bm-5', brand: 'bridgemaker', project: 'bm-5', title: '플레이북 v2 리뷰',       due: '4/20',   done: true,  priority: 'med',  assignee: 'Me' },
  { id: 't-bm-6', brand: 'bridgemaker', project: 'bm-4', title: '파트너 3곳 응답 수집',   due: '오늘',   done: false, priority: 'high', assignee: 'Me' },
  { id: 't-pm-1', brand: 'moonpm', project: 'pm-1', title: '랜딩 히어로 카피 2안',   due: '오늘',   done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-pm-2', brand: 'moonpm', project: 'pm-1', title: '접근성 감사 (대비비)',   due: '4/22',   done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-pm-3', brand: 'moonpm', project: 'pm-2', title: 'Council 검토 반영',      due: '내일',   done: false, priority: 'high', assignee: 'Council' },
  { id: 't-pm-4', brand: 'moonpm', project: 'pm-3', title: '오더 회고 템플릿',        due: '다음주', done: false, priority: 'low',  assignee: 'Me' },
  { id: 't-pm-5', brand: 'moonpm', project: 'pm-1', title: '버그: 필터 초기화 안됨',  due: '오늘',   done: true,  priority: 'high', assignee: 'Me' },
  { id: 't-cm-1', brand: 'classmoon', project: 'cm-1', title: '커리큘럼 위크3 완성', due: '4/23', done: false, priority: 'high', assignee: 'Writer' },
  { id: 't-cm-2', brand: 'classmoon', project: 'cm-1', title: '수강생 3명 DM',       due: '오늘', done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-cm-3', brand: 'classmoon', project: 'cm-1', title: '결제 링크 점검',      due: '내일', done: false, priority: 'med',  assignee: 'Operator' },
  { id: 't-ss-1', brand: 'studyseagull', project: 'ss-1', title: '이번주 독서 챕터 업로드', due: '오늘', done: true, priority: 'med', assignee: 'Me' },
  { id: 't-po-1', brand: 'politicofficer', project: 'po-1', title: '2020~24 선거 데이터 정리', due: '4/25', done: false, priority: 'high', assignee: 'Analyst' },
  { id: 't-po-2', brand: 'politicofficer', project: 'po-1', title: '핸드북 목차 초안',         due: '4/30', done: false, priority: 'med',  assignee: 'Me' },
  { id: 't-nm-1', brand: '22nomad', project: 'nm-1', title: 'About 페이지 초안', due: '다음주', done: false, priority: 'low', assignee: 'Me' },
  { id: 't-nm-2', brand: '22nomad', project: 'nm-1', title: '도메인 DNS 연결',  due: '이번주', done: false, priority: 'low', assignee: 'Me' },
];

// Account CRM detail — activity logs, contacts, notes, MRR
// Additive — keyed by account name (matches Accounts list in revenue.jsx)
export const ACCOUNT_DETAIL = {
  '클래스인': {
    mrr: 2400000,
    contacts: [
      { name: '김지수', role: '대표',     email: 'kim@classin.co',   phone: '010-2341-5821', lastContact: '오늘 11:02' },
      { name: '박유진', role: '운영 매니저', email: 'park@classin.co',  phone: '010-8821-3345', lastContact: '3일 전' },
      { name: '이한결', role: '법무 담당', email: 'legal@classin.co', phone: '010-5582-7710', lastContact: '어제' },
    ],
    activity: [
      { at: '오늘 11:02', type: 'email',   who: 'Me',      msg: 'Spring Cohort 계약서 초안 발송. 24시간 내 회신 요청.' },
      { at: '어제 16:40', type: 'call',    who: 'Me',      msg: '김 대표 15분 통화 — 결제 조건 2안 합의, 문서화 예정.' },
      { at: '2일 전',    type: 'meeting', who: 'Me + Kim', msg: 'Discovery 2차 — 코호트 일정, 강사 명단, NDA 범위 확정.' },
      { at: '3일 전',    type: 'note',    who: 'Me',      msg: '법무 검토 포인트: 환불 정책, 데이터 소유권, 강의 녹화 재사용.' },
      { at: '1주 전',    type: 'deal',    who: 'Council', msg: 'DEAL-031 스테이지 Proposal → Negotiation 이동.' },
    ],
    notes: [
      { at: '오늘 09:10', pinned: true,  body: '김 대표는 결정 속도 빠름. 이메일보다 통화 > 회의 요약 패턴이 잘 맞음.' },
      { at: '2일 전',    pinned: false, body: '강사 풀 확장 시 수익 분배 구조 재논의 필요.' },
      { at: '1주 전',    pinned: false, body: '레퍼런스 공개 가능 — 런칭 이후 케이스 스터디 협의.' },
    ],
  },
  'Studio Park': {
    mrr: 1800000,
    contacts: [
      { name: '박소연', role: '크리에이티브 디렉터', email: 'park@studiopark.kr', phone: '010-3347-9902', lastContact: '3일 전' },
      { name: '정민호', role: '프로젝트 매니저',      email: 'pm@studiopark.kr',   phone: '010-7745-2213', lastContact: '1주 전' },
    ],
    activity: [
      { at: '3일 전', type: 'email',   who: 'Me',        msg: '리브랜딩 제안서 v2 전달. 무드보드 3안 첨부.' },
      { at: '5일 전', type: 'meeting', who: 'Me + 박소연', msg: '킥오프 미팅 — 방향성 "차분한 정밀함"으로 수렴.' },
      { at: '1주 전', type: 'note',    who: 'Me',        msg: '기존 로고 폐기 동의. 새 심볼 + 워드마크 세트 필요.' },
      { at: '2주 전', type: 'deal',    who: 'Me',        msg: 'DEAL-029 생성 — 리브랜딩 범위 1차 정의.' },
    ],
    notes: [
      { at: '3일 전', pinned: true,  body: '박 디렉터는 디테일 확인 깊게 하는 편. 제안 전 내부 리뷰 한 바퀴 더 돌리기.' },
      { at: '1주 전', pinned: false, body: '가이드라인 범위: 로고 · 타이포 · 컬러 · 포토 · 레이아웃 그리드.' },
    ],
  },
  'Beanly Coffee': {
    mrr: 600000,
    contacts: [
      { name: '홍지민', role: '브랜드 매니저', email: 'hong@beanly.kr',  phone: '010-2290-4417', lastContact: '오늘' },
      { name: '차유리', role: '마케팅',       email: 'cha@beanly.kr',   phone: '010-8834-1120', lastContact: '5일 전' },
    ],
    activity: [
      { at: '오늘 14:15', type: 'email',   who: 'Me',         msg: '온라인 전략 제안 프레임 발송 — 3단계 로드맵 요약.' },
      { at: '어제',       type: 'note',    who: 'Me',         msg: '이벤트에서 받은 명함 3장 정리. 신규 매장 오픈 4월 말.' },
      { at: '3일 전',    type: 'meeting', who: 'Me + 홍지민', msg: '커피 한잔 미팅 — 자사몰 런칭 관심 확인.' },
    ],
    notes: [
      { at: '어제', pinned: false, body: '매장 중심 → DTC 전환 초기. Shopify 전제로 논의 진행.' },
    ],
  },
  '베어브릭': {
    mrr: 2000000,
    contacts: [
      { name: '오세진', role: '콜라보 총괄', email: 'oh@bearbrick.kr',  phone: '010-7788-3322', lastContact: '2주 전' },
      { name: '김하린', role: '운영 매니저', email: 'kim@bearbrick.kr', phone: '010-4412-8865', lastContact: '3주 전' },
    ],
    activity: [
      { at: '2주 전', type: 'deal',    who: 'Me',         msg: 'DEAL-014 Won — 콜라보 런칭 4/1 완료. ₩7.8M 정산.' },
      { at: '3주 전', type: 'meeting', who: 'Me + 오세진', msg: '런칭 킥오프 — 수량, 채널, 프로모션 일정 확정.' },
      { at: '1개월 전', type: 'call',   who: 'Me',         msg: '오 총괄 20분 통화 — 다음 시즌 콜라보 의향 확인.' },
    ],
    notes: [
      { at: '2주 전', pinned: true, body: '다음 시즌 콜라보 재구성 가능. 내부 리소스 배분 체크 필요.' },
    ],
  },
  '이재민': {
    mrr: 400000,
    contacts: [
      { name: '이재민', role: '개인 코칭 수강생', email: 'jaemin.lee@gmail.com', phone: '010-5521-9908', lastContact: '오늘' },
    ],
    activity: [
      { at: '오늘 08:45', type: 'meeting', who: 'Me', msg: '3개월 코칭 1회차 — 목표 설정, 주간 리듬 템플릿 공유.' },
      { at: '어제',       type: 'email',   who: 'Me', msg: '결제 영수증 재발행. Stripe 링크 전달.' },
      { at: '3일 전',    type: 'note',    who: 'Me', msg: '현재 프리랜서 디자이너. 2인 스튜디오 전환 고민 단계.' },
    ],
    notes: [
      { at: '오늘', pinned: true, body: '월 1회 90분 세션 + 주간 비동기 체크인 포맷으로 진행.' },
    ],
  },
  '정하윤': {
    mrr: 300000,
    contacts: [
      { name: '정하윤', role: '프리랜서 자문', email: 'hayoon.jung@outlook.com', phone: '010-6614-2207', lastContact: '어제' },
    ],
    activity: [
      { at: '어제',    type: 'call',    who: 'Me', msg: '월간 자문 통화 — Q2 캠페인 방향 리뷰.' },
      { at: '1주 전', type: 'email',   who: 'Me', msg: '자문 리포트 3월호 발송.' },
      { at: '2주 전', type: 'note',    who: 'Me', msg: '리테이너 구조 만족도 높음. 6개월 연장 가능성 높음.' },
    ],
    notes: [
      { at: '1주 전', pinned: false, body: '자문 범위: 브랜드 · 마케팅 · 채용 전반. 월 2회 비동기 + 1회 통화.' },
    ],
  },
};
