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
  source: { title: string; path: string; section: string; url?: string };
}

// These are editorial summaries of the named project references, not quotations.
// Business records and real-time findings never belong in this catalogue.
export const GURU_CARDS: readonly GuidanceCard[] = [
  {
    id: 'sales-meddic', kind: 'guru', domain: 'sales', person: 'Dick Dunkel · MEDDIC',
    frame: '결정권자, 선택 기준, 결정 과정을 각각 확인하는 자격 검증 관점',
    text: '제안서를 보낸 뒤에는 상대의 호감보다 실제 선택 기준과 최종 결정 과정을 확인해 보세요.',
    useWhen: '제안 후 내부 검토가 길어지는데 무엇을 기다리는지 모를 때',
    question: '내부에서 이 제안을 판단할 때 기준과 최종 승인 과정은 어떻게 되나요?',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Qualification — MEDDIC 프레임워크', url: 'https://meddicc.com/resources/who-created-meddic' },
  },
  {
    id: 'sales-gap', kind: 'guru', domain: 'sales', person: 'Keenan · GAP Selling',
    frame: '현재 상태와 원하는 상태 사이에서 실제로 불편한 지점이 무엇인지 층별로 듣는 관점',
    text: '문제가 있다고 단정하기 전에, 지금 방식이 상대의 일에 어떤 영향을 주는지 물어보세요.',
    useWhen: '고객이 필요성을 말하지만 구매 이유가 분명하지 않을 때',
    question: '지금 방식 때문에 실제 업무에서 가장 불편한 순간은 언제인가요?',
    source: { title: '세일즈 구루 12인 플레이북', path: 'docs/sales-guru-knowledge-base.md', section: 'Keenan — GAP Selling', url: 'https://salesgrowth.com/gap-selling-book/' },
  },
  {
    id: 'marketing-smallest-market', kind: 'guru', domain: 'marketing', person: 'Seth Godin · 가장 작은 시장',
    frame: '모두가 아니라 먼저 변화가 절실한 작은 고객 집단을 구체화하는 관점',
    text: '메시지가 넓게 퍼지기 전에, 가장 먼저 반응할 사람 한 집단을 구체적으로 그려보세요.',
    useWhen: '브랜드 소개 문장이 누구에게나 맞는 말처럼 들릴 때',
    question: '이 메시지를 가장 먼저 자기 이야기로 받아들일 사람은 누구인가요?',
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '세스 고딘', url: 'https://seths.blog/2022/05/the-smallest-viable-audience/' },
  },
  {
    id: 'marketing-research', kind: 'guru', domain: 'marketing', person: 'David Ogilvy · 리서치 우선',
    frame: '표현을 꾸미기 전에 고객의 언어와 확인된 사실을 수집하는 관점',
    text: '좋은 문구를 찾기 전에 고객이 실제로 쓰는 단어와 확인된 사실을 먼저 모아보세요.',
    useWhen: '소개 문구는 있지만 근거와 고객 언어가 약할 때',
    question: '고객이 이 문제를 설명할 때 실제로 어떤 말을 썼나요?',
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '데이비드 오길비', url: 'https://ogilvy.relayto.com/e/ogilvy-on-advertising-dq85bunnm5ady' },
  },
  {
    id: 'content-storybrand', kind: 'guru', domain: 'content', person: 'Donald Miller · StoryBrand',
    frame: '독자가 주인공이고 브랜드는 변화를 돕는 안내자라는 서사 관점',
    text: '도입부가 브랜드 소개로 시작한다면 독자가 원하는 변화 한 가지로 바꿔보세요.',
    useWhen: '초안의 첫 문장이 회사나 제품 설명으로 시작할 때',
    question: '독자는 이 글을 읽고 어떤 변화를 기대할까요?',
    source: { title: '마케팅·브랜딩 구루 조사', path: 'docs/marketing-branding-gurus.md', section: '도날드 밀러', url: 'https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf' },
  },
  {
    id: 'content-hook', kind: 'guru', domain: 'content', person: 'Kane Kallaway · 도입부와 재훅',
    frame: '도입부가 연 질문을 본문이 실제로 풀어 주는지 검토하는 관점',
    text: '첫 문장이 만든 궁금증을 본문에서 풀고 있는지 확인하세요. 새로운 약속만 늘리지 않습니다.',
    useWhen: '카드뉴스 첫 장과 본문이 따로 노는 느낌이 들 때',
    question: '첫 장에서 한 약속을 마지막 장까지 지켰나요?',
    source: { title: '콘텐츠 스토리텔링 인물 v2', path: 'docs/content-storytelling-people-v2.md', section: 'Kane Kallaway', url: 'https://podcasts.apple.com/us/podcast/rhythm-hooks-and-a-billion-views-kane-kallaways/id1727260996?i=1000666890786' },
  },
];

export const LEGEND_CARDS: readonly GuidanceCard[] = [
  {
    id: 'legend-buffett', kind: 'legend', domain: 'perspective', person: 'Warren Buffett · 집중',
    frame: '능력 범위 안에서 집중하고 유행을 놓치는 비용을 감수하는 판단 관점',
    text: '이번 주 더할 일보다, 내 능력 범위 밖에서 붙잡고 있는 일을 돌아보세요.',
    useWhen: '새 프로젝트를 시작하기 전에 집중의 비용을 판단할 때',
    question: '이 일을 위해 이번 주 무엇을 내려놓을 수 있나요?',
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'buffett', url: 'https://www.berkshirehathaway.com/letters/1996.html' },
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
    // This is an editorial application; an exact passage in the original book has not been checked.
    source: { title: 'Legend 마이크로 카드', path: 'apps/engine/lib/legend-cards.ts', section: 'carnegie' },
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

export function selectGuidanceCard({ cadence, domain, now = new Date(), offset = 0 }: {
  cadence: GuidanceCadence; domain?: GuidanceDomain; now?: Date; offset?: number;
}): GuidanceCard {
  const cards = listGuidanceCards({ cadence, domain });
  if (!cards.length) throw new Error(`No guidance cards for ${cadence}/${domain ?? ''}`);
  const seed = dayNumber(guidancePeriodKey(cadence, now));
  const index = ((seed + Math.trunc(offset)) % cards.length + cards.length) % cards.length;
  return cards[index];
}

export function guidancePromptFrame(id: string): string {
  const card = [...GURU_CARDS, ...LEGEND_CARDS].find(item => item.id === id);
  if (!card) return '';
  return `참고 방법론(자료 요약, 인용 아님): ${card.person} — ${card.frame}. 출처: ${card.source.path} §${card.source.section}. 현재 원장 사실과 분리하고 필요한 경우에만 적용하십시오.`;
}
