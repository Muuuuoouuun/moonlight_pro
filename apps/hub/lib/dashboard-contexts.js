export const WORK_CONTEXTS = [
  {
    value: "all",
    label: "전체 프로젝트",
    description: "제품, 세일즈, PMS, 엔진 작업을 하나의 공용 운영 레인에서 함께 봅니다.",
    keywords: [],
  },
  {
    value: "com_moon",
    label: "Com_Moon",
    description: "허브 쉘, 프라이빗 OS, 그리고 창업자 운영 맥락을 다루는 레인입니다.",
    keywords: ["com moon", "hub", "hub os", "founder", "operator", "desk", "activation", "moonlight", "moonlight pro", "moonlight_pro"],
  },
  {
    value: "classinkr-web",
    label: "classinkr-web",
    description: "제품 빌드, 콘텐츠 표면, 랜딩 흐름, 그리고 딜리버리 맥락을 묶는 레인입니다.",
    keywords: ["classinkr", "content", "studio", "publish", "landing", "card", "carousel"],
  },
  {
    value: "sales_branding_dash",
    label: "sales_branding_dash",
    description: "세일즈, 브랜딩, 고객 증거, 대시보드 기획 맥락을 다루는 레인입니다.",
    keywords: ["sales", "branding", "lead", "client", "proposal", "growth", "dashboard"],
  },
  {
    value: "ai-command-pot",
    label: "ai-command-pot",
    description: "자동화, 엔진, 웹훅, 오케스트레이션 맥락을 묶는 레인입니다.",
    keywords: ["ai", "command", "automation", "engine", "webhook", "telegram", "bot", "sync"],
  },
];

export const CONTENT_BRANDS = [
  {
    value: "all",
    label: "전체 브랜드",
    description: "먼저 공용 콘텐츠 시스템을 보고, 그다음 한 브랜드 범위로 좁혀 들어갑니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "먼저 비교 / 나중에 좁힘 / 규칙은 항상 노출",
    forbiddenLanguage:
      "하나의 초안 안에서 서로 다른 브랜드의 증거, CTA, 톤 규칙을 섞지 않습니다.",
    keyMessage:
      "처음에는 넓게 보고, 리뷰·발행·자동화 handoff 전에 반드시 한 브랜드로 잠급니다.",
    primaryChannels: "인스타그램 / 인사이트 / 뉴스레터 / 랜딩",
    formatFocus: "카드뉴스, 운영자 노트, 랜딩 증거 블록",
    ctaPattern: "관찰 -> 적합성 -> 다음 단계",
    publishRhythm: "공용 개요 먼저, 출고 전에는 브랜드별 판단으로 좁힘",
    recommendedTemplateId: "hook-proof-cta",
    recommendedTemplateLabel: "후킹 / 증거 / CTA",
    recommendedChannel: "인스타그램",
    handoffNote:
      "브랜드를 하나 고르면 후킹, CTA, 발행 채널을 그 브랜드 기준으로만 맞춥니다.",
  },
  {
    value: "sinabro",
    label: "시나브로",
    description: "카피 규칙, 에셋, 발행 이력이 분리된 전용 브랜드 레인입니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "차분함 / 꾸준함 / 사람 중심",
    forbiddenLanguage: "과장, 기적 서사, 압박감이 큰 긴급성 표현은 피합니다.",
    keyMessage: "메시지가 차분하고 정확하며 사람답게 느껴질 때 느린 신뢰가 쌓입니다.",
    primaryChannels: "뉴스레터 / 인사이트",
    formatFocus: "운영자 노트, 성찰형 카드뉴스, 짧은 브리프",
    ctaPattern: "관찰 -> 이해 -> 응답",
    publishRhythm: "화 인사이트 / 금 브리프",
    recommendedTemplateId: "ops-note",
    recommendedTemplateLabel: "운영자 노트",
    recommendedChannel: "뉴스레터",
    handoffNote: "문장은 서두르지 않게 유지합니다. 증거는 광고가 아니라 관찰처럼 느껴져야 합니다.",
  },
  {
    value: "gore",
    label: "고래(Go;Re)",
    description: "메시지, 포맷, 리뷰 루프를 하나의 범위에서 선명하게 관리합니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "대담함 / 방향감 / 강한 대비",
    forbiddenLanguage: "수동적인 프레이밍, 흐릿한 동사, 약한 마무리는 피합니다.",
    keyMessage: "관심을 빠르게 움직임으로 바꿀 만큼 결단력 있게 느껴져야 합니다.",
    primaryChannels: "인스타그램 / 랜딩",
    formatFocus: "문제 제기형 카드뉴스, 전환 카피",
    ctaPattern: "문제 -> 전환 -> 행동",
    publishRhythm: "월 후킹 / 목 전환 푸시",
    recommendedTemplateId: "problem-shift-action",
    recommendedTemplateLabel: "문제 / 전환 / 행동",
    recommendedChannel: "인스타그램",
    handoffNote: "마찰을 빠르게 드러내고, 곧바로 독자가 취할 행동으로 연결합니다.",
  },
  {
    value: "holyfuncollector",
    label: "HolyFunCollector",
    description: "메시지 설계, 포맷 선택, 발행 리듬을 브랜드 단위로 관리하는 레인입니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "유쾌함 / 호기심 / 이미지 중심",
    forbiddenLanguage: "기업식 딱딱함과 펀치라인 과설명은 피합니다.",
    keyMessage: "호기심이 먼저 꽂히고, 의미는 한 박자 뒤에 풀려야 합니다.",
    primaryChannels: "인스타그램 / 인사이트",
    formatFocus: "후킹형 카드뉴스, 유쾌한 비주얼 팩",
    ctaPattern: "불꽃 -> 드러냄 -> 합류",
    publishRhythm: "수 비주얼 드롭 / 토 후속",
    recommendedTemplateId: "hook-proof-cta",
    recommendedTemplateLabel: "후킹 / 증거 / CTA",
    recommendedChannel: "인스타그램",
    handoffNote: "놀라움을 지켜야 합니다. 첫 카드는 가볍고 날카롭고 즉시 시각적이어야 합니다.",
  },
  {
    value: "bridgemaker",
    label: "BridgeMaker",
    description: "BridgeMaker 카피, 에셋, 발행 후속을 하나의 집중 레인으로 묶습니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "신뢰 / 연결 / 비즈니스 명료성",
    forbiddenLanguage: "증거나 고객 적합성 표현 없는 추상적 영감 문장은 피합니다.",
    keyMessage: "문제, 증거, 비즈니스 적합성을 우회 없이 연결해야 합니다.",
    primaryChannels: "랜딩 / 뉴스레터",
    formatFocus: "고객용 랜딩 증거, handoff 메모",
    ctaPattern: "맥락 -> 증거 -> 다음 대화",
    publishRhythm: "화 랜딩 업데이트 / 금 고객 브리프",
    recommendedTemplateId: "problem-shift-action",
    recommendedTemplateLabel: "문제 / 전환 / 행동",
    recommendedChannel: "랜딩",
    handoffNote: "모든 초안은 다음 비즈니스 대화를 더 쉽게 시작하게 만들어야 합니다.",
  },
  {
    value: "moonpm",
    label: "MoonPM",
    description: "MoonPM의 콘텐츠 판단, 에셋 팩, 발행 흐름을 한 번에 묶습니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "분석적 / 운영자 시선 / 증거 중심",
    forbiddenLanguage: "운영 디테일 없는 붕 뜬 프로세스 담론은 피합니다.",
    keyMessage: "운영 시스템이 실제 업무 마찰을 어떻게 줄이는지 이론이 아니라 현실로 보여줍니다.",
    primaryChannels: "인사이트 / 뉴스레터",
    formatFocus: "운영 메모, 시스템 인사이트, 리뷰 친화형 카드뉴스",
    ctaPattern: "신호 -> 시스템 -> 다음 움직임",
    publishRhythm: "화 시스템 노트 / 목 체크리스트 / 금 회고",
    recommendedTemplateId: "ops-note",
    recommendedTemplateLabel: "운영자 노트",
    recommendedChannel: "인사이트",
    handoffNote: "운영자 시선을 잃지 않습니다. 무엇이 바뀌었고, 왜 중요했고, 다음에 무엇이 오는지 보여줘야 합니다.",
  },
  {
    value: "class-moon",
    label: "Class.Moon",
    description: "Class.Moon 초안, 에셋, 채널 이력을 위한 단일 브랜드 범위입니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "프리미엄 / 미니멀 / 정확함",
    forbiddenLanguage: "시끄러운 강도, 어수선한 증거, 과도한 CTA는 피합니다.",
    keyMessage: "차갑지 않으면서도 정제되고 선별적이며 자신감 있게 느껴져야 합니다.",
    primaryChannels: "랜딩 / 인사이트",
    formatFocus: "미니멀 랜딩 카피, 프리미엄 카드뉴스",
    ctaPattern: "프레임 -> 증거 -> 초대",
    publishRhythm: "월 폴리시 / 목 증거 업데이트",
    recommendedTemplateId: "hook-proof-cta",
    recommendedTemplateLabel: "후킹 / 증거 / CTA",
    recommendedChannel: "랜딩",
    handoffNote: "편안한 수준보다 한 문장 더 덜어냅니다. 여기서 프리미엄은 더 적고, 더 깨끗하고, 더 선명한 것입니다.",
  },
  {
    value: "study-seagull",
    label: "Study.Seagull",
    description: "Study.Seagull 콘텐츠를 브랜드 단위 큐와 기준 프레임으로 검토합니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "교육형 / 구조적 / 도움 중심",
    forbiddenLanguage: "바로 써먹을 학습 단계 없는 모호한 영감 문장은 피합니다.",
    keyMessage: "각 콘텐츠는 독자가 오늘 바로 쓸 수 있는 프레임 하나를 더 선명하게 남겨야 합니다.",
    primaryChannels: "인사이트 / 인스타그램",
    formatFocus: "설명형 카드뉴스, 학습 메모",
    ctaPattern: "질문 -> 프레임 -> 적용",
    publishRhythm: "화 설명 / 토 회고",
    recommendedTemplateId: "problem-shift-action",
    recommendedTemplateLabel: "문제 / 전환 / 행동",
    recommendedChannel: "인사이트",
    handoffNote: "콘텐츠 하나당 한 가지만 가르칩니다. 프레임이 둘이면 초안을 나눕니다.",
  },
  {
    value: "politic-officer",
    label: "Politic Officer",
    description: "Politic Officer의 메시지, 에셋, 발행 루프를 한눈에 읽히게 유지합니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "다큐멘터리 / 절제 / 맥락 중심",
    forbiddenLanguage: "선정성과 맥락 없는 단순화된 해석은 피합니다.",
    keyMessage: "결론이 도착하기 전에 맥락이 먼저 설득해야 합니다.",
    primaryChannels: "인사이트 / 뉴스레터",
    formatFocus: "맥락 메모, 다큐형 카드뉴스",
    ctaPattern: "맥락 -> 함의 -> 응답",
    publishRhythm: "수 맥락 노트 / 일 주간 종합",
    recommendedTemplateId: "ops-note",
    recommendedTemplateLabel: "운영자 노트",
    recommendedChannel: "인사이트",
    handoffNote: "뉘앙스를 보존합니다. 문장이 너무 단정적이면 빠진 조건이나 증거를 보강합니다.",
  },
  {
    value: "22th-nomad",
    label: "22th.Nomad",
    description: "22th.Nomad 콘텐츠 작업과 릴리스 추적을 위한 전용 범위입니다.",
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    toneKeywords: "탐색적 / 필드노트 / 전진감",
    forbiddenLanguage: "움직임과 발견을 죽이는 정적인 요약 문체는 피합니다.",
    keyMessage: "사후 보고서가 아니라 움직임 한가운데서 보낸 디스패치처럼 느껴져야 합니다.",
    primaryChannels: "인스타그램 / 뉴스레터",
    formatFocus: "필드노트 카드뉴스, 이동감 있는 운영 브리프",
    ctaPattern: "장면 -> 통찰 -> 이동",
    publishRhythm: "목 디스패치 / 일 주간 노트",
    recommendedTemplateId: "hook-proof-cta",
    recommendedTemplateLabel: "후킹 / 증거 / CTA",
    recommendedChannel: "인스타그램",
    handoffNote: "움직임의 감각을 살립니다. 관찰한 한 장면이 초안 전체를 끌고 가게 둡니다.",
  },
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[._/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return typeof value === "string" ? value : "";
}

function resolveContextOption(options, value) {
  const normalized = normalizeText(resolveQueryValue(value));
  if (!normalized) {
    return options[0];
  }

  return (
    options.find((item) => {
      if (normalizeText(item.value) === normalized) {
        return true;
      }

      return (item.keywords || []).some((keyword) => normalizeText(keyword) === normalized);
    }) || options[0]
  );
}

export function resolveWorkContext(value) {
  return resolveContextOption(WORK_CONTEXTS, value);
}

export function resolveContentBrand(value) {
  return resolveContextOption(CONTENT_BRANDS, value);
}

export function getContentBrandLabel(value) {
  return resolveContentBrand(value).label;
}

function matchesKeywords(keywords, values) {
  if (!keywords.length) {
    return true;
  }

  const haystack = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
}

export function scopeMappedItemsByWorkContext(items, contextValue, selector) {
  const context = resolveWorkContext(contextValue);
  const sourceItems = items || [];

  if (context.value === WORK_CONTEXTS[0].value || !sourceItems.length) {
    return {
      context,
      items: sourceItems,
      isScoped: false,
      isFallback: false,
    };
  }

  const filteredItems = sourceItems.filter((item) => matchesKeywords(context.keywords, selector(item)));

  if (filteredItems.length) {
    return {
      context,
      items: filteredItems,
      isScoped: true,
      isFallback: false,
    };
  }

  return {
    context,
    items: sourceItems,
    isScoped: false,
    isFallback: true,
  };
}

export function getContentBrandReference(value) {
  const brand = resolveContentBrand(value);

  if (brand.value === CONTENT_BRANDS[0].value) {
    return {
      ...brand,
      title: "브랜드 운영 시스템",
      description:
        "공용 레인에서 브랜드를 먼저 비교하고, 카피 통제가 더 필요해지는 시점에 한 브랜드로 좁혀 들어갑니다.",
      rule: "각 브랜드는 같은 콘텐츠 표면 안에서 톤, CTA, 발행 판단이 함께 보여야 합니다.",
      status:
        "브랜드를 하나 고르면 스튜디오, 큐, 발행 리뷰 루프가 하나의 정체성으로 잠깁니다.",
    };
  }

  return {
    ...brand,
    title: `${brand.label} 운영 기준`,
    description: `${brand.label}의 톤, 재사용 가능한 포맷 선택, 발행 판단을 하나의 범위에서 유지합니다.`,
    rule: "선택한 브랜드를 톤, CTA, 리뷰 피드백의 단일 기준으로 취급합니다.",
    status:
      "브랜드 키가 명시된 행부터 먼저 좁혀지고, 공용 행은 콘텐츠 테이블에 메타데이터가 채워질 때까지 함께 보입니다.",
  };
}

export function appendQueryParam(href, key, value) {
  const params = new URLSearchParams();

  if (value) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${href}?${query}` : href;
}
