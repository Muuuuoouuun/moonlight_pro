export type GuidanceDomain = 'sales' | 'marketing' | 'content';
export type GuidanceCadence = 'daily' | 'weekly';

export interface GuidanceCard {
  id: string;
  kind: 'guru' | 'legend';
  domain: GuidanceDomain | 'perspective';
  person: string;
  frame: string;
  text: string;
  useWhen: string;
  question: string;
  contexts?: readonly string[];
  source: { title: string; path: string; section: string; url?: string; application?: 'adapted'; note?: string };
}

// These are editorial summaries of the named project references, not quotations.
// Business records and real-time findings never belong in this catalogue.
export const GURU_CARDS: readonly GuidanceCard[] = [
  {
    id: 'sales-meddic', kind: 'guru', domain: 'sales', person: 'Dick Dunkel · MEDDIC',
    frame: '결정권자, 선택 기준, 결정 과정을 각각 확인하는 자격 검증 관점',
    text: '검토가 길어지면 상대의 호감보다 실제 선택 기준과 최종 결정 과정을 확인해 보세요.',
    useWhen: '제안 후 내부 검토가 길어지는데 무엇을 기다리는지 모를 때',
    question: '내부에서 이 제안을 판단할 때 기준과 최종 승인 과정은 어떻게 되나요?',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Qualification — MEDDIC 프레임워크', url: 'https://meddicc.com/resources/who-created-meddic' },
  },
  {
    id: 'sales-gap', kind: 'guru', domain: 'sales', person: 'Keenan · GAP Selling',
    frame: '현재 상태와 원하는 상태 사이에서 실제로 불편한 지점이 무엇인지 층별로 듣는 관점',
    text: '문제가 있다고 단정하기 전에, 지금 방식이 상대의 일에 어떤 영향을 주는지 물어보세요.',
    useWhen: '고객이 필요성을 말하지만 구매 이유가 분명하지 않을 때',
    question: '지금 방식 때문에 실제 업무에서 가장 불편한 순간은 언제인가요?',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Keenan — GAP Selling', url: 'https://salesgrowth.com/gap-selling-book/' },
  },
  {
    id: 'sales-spin-implication', kind: 'guru', domain: 'sales', person: 'Neil Rackham · SPIN',
    frame: '고객이 말한 문제의 업무상 영향을 더 깊이 이해하는 Implication 질문 관점',
    text: '불편하다는 말에서 멈추지 말고, 그 문제가 실제 운영에 남기는 영향을 물어보세요.',
    useWhen: '고객이 문제는 말했지만 중요도와 우선순위가 불명확할 때',
    question: '그 문제가 계속되면 어떤 업무나 결과에 영향이 있나요?',
    contexts: ['sales:new', 'sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'SPIN Selling System · Implication Questions', url: 'https://www.huthwaiteinternational.com/spin-methodology' },
  },
  {
    id: 'sales-voss-feasibility', kind: 'guru', domain: 'sales', person: 'Chris Voss · 실행 조건',
    frame: '긍정적인 반응을 실제 실행 조건으로 확인하는 보정 질문 관점',
    text: '합의가 보이면 실행 조건을 상대의 말로 확인해 보세요.',
    useWhen: '긍정 답변은 있지만 실행 방법이 불명확할 때',
    question: '실제로 진행하려면 어떤 조건이 먼저 갖춰져야 하나요?',
    contexts: ['sales:active', 'sales:dormant'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Calibrated Questions', url: 'https://www.blackswanltd.com/newsletter/the-power-of-calibrated-questions-shaping-conversations-with-precision' },
  },
  {
    id: 'sales-ross-fit', kind: 'guru', domain: 'sales', person: 'Aaron Ross · 맞는 고객',
    frame: '연락량보다 이상적 고객의 공통 조건과 맞지 않는 조건을 먼저 정의하는 ICP 관점',
    text: '연락 대상을 늘리기 전에, 잘 맞는 고객의 공통 조건과 맞지 않는 조건을 먼저 적어보세요.',
    useWhen: '잠재고객 범위가 넓고 우선 연락 대상을 고르기 어려울 때',
    question: '기존 고객 중 가장 잘 맞았던 곳의 공통 조건은 무엇인가요?',
    contexts: ['sales:new'],
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'ICP — Ideal Customer Profile', url: 'https://predictablerevenue.com/blog/15-minute-summary-of-predictable-revenue/' },
  },
  {
    id: 'marketing-smallest-market', kind: 'guru', domain: 'marketing', person: 'Seth Godin · 가장 작은 고객군',
    frame: '모두가 아니라 먼저 변화가 절실한 작은 고객 집단을 구체화하는 관점',
    text: '메시지가 넓게 퍼지기 전에, 가장 먼저 반응할 사람 한 집단을 구체적으로 그려보세요.',
    useWhen: '브랜드 소개 문장이 누구에게나 맞는 말처럼 들릴 때',
    question: '이 메시지를 가장 먼저 자기 이야기로 받아들일 사람은 누구인가요?',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '세스 고딘', url: 'https://seths.blog/2022/05/the-smallest-viable-audience/' },
  },
  {
    id: 'marketing-research', kind: 'guru', domain: 'marketing', person: 'David Ogilvy · 리서치 우선',
    frame: '표현을 꾸미기 전에 고객의 언어와 확인된 사실을 수집하는 관점',
    text: '좋은 문구를 찾기 전에 고객이 실제로 쓰는 단어와 확인된 사실을 먼저 모아보세요.',
    useWhen: '소개 문구는 있지만 근거와 고객 언어가 약할 때',
    question: '고객이 이 문제를 설명할 때 실제로 어떤 말을 썼나요?',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '데이비드 오길비', url: 'https://ogilvy.relayto.com/e/ogilvy-on-advertising-dq85bunnm5ady' },
  },
  {
    id: 'marketing-permission', kind: 'guru', domain: 'marketing', person: 'Seth Godin · 기대하는 메시지',
    frame: '받는 사람이 원하고 기대하는 메시지인지 먼저 확인하는 허락 마케팅 관점',
    text: '메시지를 더 보내기 전에, 받는 사람이 왜 지금 이 내용을 기대할지 확인해 보세요.',
    useWhen: '채널이나 발송 빈도를 늘릴지 고민할 때',
    question: '이 메시지는 누가 먼저 요청하거나 기다릴 만한 내용인가요?',
    contexts: ['marketing:audience-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '핵심 철학 2 — 허락 마케팅', url: 'https://seths.blog/2008/01/permission-mark/' },
  },
  {
    id: 'marketing-specific-promise', kind: 'guru', domain: 'marketing', person: 'David Ogilvy · 확인 가능한 이점',
    frame: '추상적인 우월성보다 조사로 확인할 수 있는 고객 이점을 앞세우는 관점',
    text: '추상적인 장점 대신 확인할 수 있는 이점 한 가지를 앞에 놓아보세요.',
    useWhen: '소개 문구가 최고·혁신·효율 같은 말에 머물 때',
    question: '상대가 직접 확인할 수 있는 이점은 무엇인가요?',
    contexts: ['marketing:audience-unrecorded', 'marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '데이비드 오길비 · 리서치 우선주의', url: 'https://ogilvy.relayto.com/e/ogilvy-on-advertising-dq85bunnm5ady' },
  },
  {
    id: 'marketing-clear-plan', kind: 'guru', domain: 'marketing', person: 'Donald Miller · 쉬운 시작',
    frame: '고객이 원하는 변화로 가는 첫 단계를 간단히 보여 주는 StoryBrand 계획 관점',
    text: '고객이 원한 변화를 향해 어떻게 시작하는지 한눈에 보이게 해보세요.',
    useWhen: '브랜드 메시지는 있으나 이용 흐름이 막연할 때',
    question: '고객이 첫 단계에서 해야 할 일은 무엇인가요?',
    contexts: ['marketing:promise-unrecorded', 'marketing:general'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '도날드 밀러 · 4단계: 계획', url: 'https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf' },
  },
  {
    id: 'content-storybrand', kind: 'guru', domain: 'content', person: 'Donald Miller · StoryBrand',
    frame: '독자가 주인공이고 브랜드는 변화를 돕는 안내자라는 서사 관점',
    text: '도입부가 브랜드 소개로 시작한다면 독자가 원하는 변화 한 가지로 바꿔보세요.',
    useWhen: '초안의 첫 문장이 회사나 제품 설명으로 시작할 때',
    question: '독자는 이 글을 읽고 어떤 변화를 기대할까요?',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '도날드 밀러', url: 'https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf' },
  },
  {
    id: 'content-hook', kind: 'guru', domain: 'content', person: 'Kane Kallaway · 도입부와 재훅',
    frame: '도입부가 연 질문을 본문이 실제로 풀어 주는지 검토하는 관점',
    text: '첫 문장이 만든 궁금증을 본문에서 풀고 있는지 확인하세요. 새로운 약속만 늘리지 않습니다.',
    useWhen: '카드뉴스 첫 장과 본문이 따로 노는 느낌이 들 때',
    question: '첫 장에서 한 약속을 마지막 장까지 지켰나요?',
    contexts: ['content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Kane Kallaway', url: 'https://podcasts.apple.com/us/podcast/rhythm-hooks-and-a-billion-views-kane-kallaways/id1727260996?i=1000666890786', application: 'adapted', note: '영상의 재훅 원리를 카드뉴스의 첫 장과 본문 관계에 적용한 Moonlight 해석' },
  },
  {
    id: 'content-three-tests', kind: 'guru', domain: 'content', person: 'Harry Dry · 첫 문장 점검',
    frame: '한 문장이 그려지는지, 확인 가능한지, 그 브랜드만 말할 수 있는지 묻는 카피 점검 관점',
    text: '첫 문장이 그려지는지, 확인 가능한지, 우리만 말할 수 있는지 점검해 보세요.',
    useWhen: '제목이나 첫 장이 두루뭉술할 때',
    question: '이 문장을 다른 브랜드도 그대로 쓸 수 있나요?',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Harry Dry · 3가지 판정 질문', url: 'https://writingexamples.com/article/harry-dry-write-great-copy' },
  },
  {
    id: 'content-multiplication', kind: 'guru', domain: 'content', person: 'Justin Welsh · 소재 재사용',
    frame: '검증된 생각 하나를 다른 매체의 독자에게 맞춰 다시 구성하는 관점',
    text: '새 주제를 찾기 전에, 이미 반응한 생각 하나를 다른 형식에 맞게 다시 구성해 보세요.',
    useWhen: '제작 부담이 커지고 기존 소재가 쌓여 있을 때',
    question: '이 아이디어를 다른 채널의 독자에게 어떻게 설명할까요?',
    contexts: ['content:idea'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Justin Welsh · 콘텐츠 운영체제', url: 'https://justinwelsh.me/essays/leverage' },
  },
  {
    id: 'content-perspective', kind: 'guru', domain: 'content', person: 'Dan Koe · 직접 본 관점',
    frame: '널리 다룬 주제에 자신의 관찰과 사례를 더해 분명한 관점을 만드는 방식',
    text: '흔한 주제라도 내가 본 문제와 실제 사례를 붙이면 새 이야기가 됩니다.',
    useWhen: '다룰 주제는 있지만 나만의 관점이 약할 때',
    question: '이 주제에서 내가 직접 본 반례나 사례는 무엇인가요?',
    contexts: ['content:idea', 'content:draft', 'content:review'],
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Dan Koe', url: 'https://thedankoe.com/letters/how-to-think-originally/' },
  },
];

export const LEGEND_CARDS: readonly GuidanceCard[] = [
  {
    id: 'legend-buffett', kind: 'legend', domain: 'perspective', person: 'Warren Buffett · 집중',
    frame: '능력 범위 안에서 집중하고 유행을 놓치는 비용을 감수하는 판단 관점',
    text: '이번 주 더할 일보다, 내 능력 범위 밖에서 붙잡고 있는 일을 돌아보세요.',
    useWhen: '새 프로젝트를 시작하기 전에 집중의 비용을 판단할 때',
    question: '이 일을 위해 이번 주 무엇을 내려놓을 수 있나요?',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'buffett', url: 'https://www.berkshirehathaway.com/letters/1996.html', application: 'adapted', note: '투자에서 말한 능력 범위를 주간 업무 선택에 적용한 Moonlight 해석' },
  },
  {
    id: 'legend-feynman', kind: 'legend', domain: 'perspective', person: 'Richard Feynman · 불리한 근거',
    frame: '내 주장에 불리한 사실과 다른 설명 가능성을 먼저 드러내는 지적 정직성 관점',
    text: '지금 결정을 지지하는 근거와 함께, 결론을 흔들 수 있는 사실도 적어 보세요.',
    useWhen: '익숙한 설명이 반례와 불확실성을 가릴 수 있을 때',
    question: '이 판단에 불리한 근거는 무엇이며, 확인하면 결론을 바꿀 사실은 무엇인가요?',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'feynman', url: 'https://calteches.library.caltech.edu/3043/' },
  },
  {
    id: 'legend-carnegie', kind: 'legend', domain: 'perspective', person: 'Dale Carnegie · 상대 관점',
    frame: '논쟁에서 이기기보다 상대의 중요감과 관심사를 먼저 듣는 관계 관점',
    text: '내 주장을 더 설명하기 전에 상대가 중요하게 여기는 것을 먼저 들어보세요.',
    useWhen: '고객과 이견을 풀거나 관계를 회복할 때',
    question: '상대는 지금 무엇을 지키려고 하나요?',
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

export function selectGuidanceCard({ cadence, domain, now = new Date(), offset = 0, contextKey }: {
  cadence: GuidanceCadence; domain?: GuidanceDomain; now?: Date; offset?: number; contextKey?: string;
}): GuidanceCard {
  const catalogue = listGuidanceCards({ cadence, domain });
  const matched = cadence === 'daily' && contextKey
    ? catalogue.filter(card => card.contexts?.includes(contextKey)) : [];
  // A situational set must still sustain all three fixed daily windows.
  // Unknown or narrow context falls back to the reviewed domain catalogue.
  const cards = matched.length >= 3 ? matched : catalogue;
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
    `적용할 때: ${card.useWhen}.`,
    card.source.note ? `응용 범위: ${card.source.note}.` : '',
    `출처 메타데이터: ${card.source.path} §${card.source.section}; ${card.source.url || '원전 URL 미확인'}.`,
    '원전 본문을 직접 읽은 것으로 주장하지 마십시오. 현재 원장 사실과 분리하고 상황에 맞을 때만 적용하십시오.',
  ].filter(Boolean).join(' ');
}
