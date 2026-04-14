export const WORK_CONTEXTS = [
  {
    value: "all",
    label: "All Projects",
    description: "Product, sales, PMS, and engine work in one shared operating lane.",
    keywords: [],
  },
  {
    value: "com_moon",
    label: "Com_Moon",
    description: "Hub shell, private OS, and founder-level operating context.",
    keywords: ["com moon", "hub", "hub os", "founder", "operator", "desk", "activation", "moonlight", "moonlight pro", "moonlight_pro"],
  },
  {
    value: "classinkr-web",
    label: "classinkr-web",
    description: "Product build, content surface, landing flow, and delivery context.",
    keywords: ["classinkr", "content", "studio", "publish", "landing", "card", "carousel"],
  },
  {
    value: "sales_branding_dash",
    label: "sales_branding_dash",
    description: "Sales, branding, client proof, and dashboard planning context.",
    keywords: ["sales", "branding", "lead", "client", "proposal", "growth", "dashboard"],
  },
  {
    value: "ai-command-pot",
    label: "ai-command-pot",
    description: "Automation, engine, webhook, and orchestration context.",
    keywords: ["ai", "command", "automation", "engine", "webhook", "telegram", "bot", "sync"],
  },
];

export const CONTENT_BRANDS = [
  {
    value: "all",
    label: "All Brands",
    description: "See the shared content system first, then drop into a single brand scope.",
  },
  {
    value: "sinabro",
    label: "시나브로",
    description: "A dedicated brand lane with its own copy rules, assets, and publish history.",
  },
  {
    value: "gore",
    label: "고래(Go;Re)",
    description: "Keep this brand's message, formats, and review loop visible in one scope.",
  },
  {
    value: "holyfuncollector",
    label: "HolyFunCollector",
    description: "A brand-specific lane for message shaping, format choice, and release rhythm.",
  },
  {
    value: "bridgemaker",
    label: "BridgeMaker",
    description: "Use one focused lane for BridgeMaker copy, assets, and publish follow-up.",
  },
  {
    value: "moonpm",
    label: "MoonPM",
    description: "Hold MoonPM content decisions, asset packs, and publishing motion together.",
  },
  {
    value: "class-moon",
    label: "Class.Moon",
    description: "A single brand scope for Class.Moon drafts, assets, and channel history.",
  },
  {
    value: "study-seagull",
    label: "Study.Seagull",
    description: "Review Study.Seagull content with one brand-level queue and reference frame.",
  },
  {
    value: "politic-officer",
    label: "Politic Officer",
    description: "Keep Politic Officer message, assets, and publish loops easy to scan.",
  },
  {
    value: "22th-nomad",
    label: "22th.Nomad",
    description: "A dedicated scope for 22th.Nomad content work and release tracking.",
  },
];

const PROJECT_STUDIO_CONFIGS = {
  all: {
    brand: "all",
    templateId: "hook-proof-cta",
    channel: "Instagram",
    studioTitle: "Shared content lane",
    storyAngle: "프로젝트에서 실제로 움직인 변화 한 가지를 메시지로 꺼냅니다.",
    operatorPrompt: "이번 주 가장 먼저 말해야 할 장면 하나를 고르고, 그 장면만 선명하게 남깁니다.",
    publishHint: "Instagram 카드로 먼저 검증한 뒤 다른 채널로 재가공합니다.",
  },
  com_moon: {
    brand: "moonpm",
    templateId: "ops-note",
    channel: "Insights",
    studioTitle: "Founder operating note",
    storyAngle: "운영 판단과 실행 감각을 짧은 인사이트 카드로 번역합니다.",
    operatorPrompt: "이번 주 판단이 바뀐 순간과 그 이유를 카드 한 묶음으로 정리합니다.",
    publishHint: "Insights 톤으로 먼저 다듬고, 반응이 좋으면 뉴스레터로 확장합니다.",
  },
  "classinkr-web": {
    brand: "class-moon",
    templateId: "hook-proof-cta",
    channel: "Instagram",
    studioTitle: "Product story lane",
    storyAngle: "기능 설명보다 사용자 효익과 전환 장면이 먼저 보이게 만듭니다.",
    operatorPrompt: "제품 변화가 사용자에게 주는 결과를 첫 장 훅으로 잡습니다.",
    publishHint: "Instagram 카드뉴스로 실험한 뒤 랜딩과 퍼블리시 문구로 재사용합니다.",
  },
  sales_branding_dash: {
    brand: "bridgemaker",
    templateId: "problem-shift-action",
    channel: "Newsletter",
    studioTitle: "Proof-led sales story",
    storyAngle: "문제 인식에서 시야 전환, 그리고 제안까지 한 흐름으로 밀어줍니다.",
    operatorPrompt: "상대가 왜 지금 이 이야기를 들어야 하는지부터 분명하게 답합니다.",
    publishHint: "뉴스레터나 세일즈 메일로 먼저 보내고, 반응 좋은 메시지를 카드로 되돌립니다.",
  },
  "ai-command-pot": {
    brand: "all",
    templateId: "ops-note",
    channel: "Insights",
    studioTitle: "Automation explainer",
    storyAngle: "복잡한 시스템 변경을 사람이 이해할 수 있는 운영 변화로 번역합니다.",
    operatorPrompt: "기술 설명이 아니라 행동이 어떻게 달라졌는지부터 적습니다.",
    publishHint: "내부 인사이트 카드로 먼저 정리하고, 필요한 부분만 외부 공유용으로 압축합니다.",
  },
};

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
  return options.find((item) => normalizeText(item.value) === normalized) || options[0];
}

export function resolveWorkContext(value) {
  return resolveContextOption(WORK_CONTEXTS, value);
}

export function resolveContentBrand(value) {
  return resolveContextOption(CONTENT_BRANDS, value);
}

export function inferWorkContextFromValues(values) {
  const sourceValues = Array.isArray(values) ? values : [values];

  return (
    WORK_CONTEXTS.slice(1).find((item) => matchesKeywords(item.keywords, sourceValues)) ||
    WORK_CONTEXTS[0]
  );
}

export function inferWorkContextFromProject(project) {
  return inferWorkContextFromValues([
    project?.title,
    project?.owner,
    project?.milestone,
    project?.nextAction,
    project?.risk,
    project?.taskLead,
  ]);
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
      title: "Brand directory",
      description: "Use the shared lane to compare brands, then drop into one brand when the copy needs tighter control.",
      directory: "브랜드 디렉토리",
      format: "브랜드 포맷",
      rule: "Each brand should keep tone, CTA, and publish choices visible from the same content surface.",
      status: "Select one brand to lock the studio and review loop to a single identity.",
    };
  }

  return {
    ...brand,
    title: `${brand.label} reference`,
    description: `${brand.label} should keep its tone, reusable format choices, and publish judgment in one scope.`,
    directory: "브랜드 디렉토리",
    format: "브랜드 포맷",
    rule: "Treat the selected brand as the source of truth for tone, CTA, and review feedback.",
    status: "Live brand-key filtering is not in the schema yet, so shared rows stay visible until that mapping lands.",
  };
}

export function getProjectStudioConfig(value) {
  const context = resolveWorkContext(value);
  const config = PROJECT_STUDIO_CONFIGS[context.value] || PROJECT_STUDIO_CONFIGS.all;

  return {
    ...config,
    context,
  };
}

export function buildContentStudioHref({
  project = "all",
  brand,
  template,
  channel,
} = {}) {
  const config = getProjectStudioConfig(project);
  const params = new URLSearchParams();
  const nextProject = project || "all";
  const nextBrand = brand || config.brand;
  const nextTemplate = template || config.templateId;
  const nextChannel = channel || config.channel;

  if (nextProject && nextProject !== "all") {
    params.set("project", nextProject);
  }

  if (nextBrand && nextBrand !== "all") {
    params.set("brand", nextBrand);
  }

  if (nextTemplate) {
    params.set("template", nextTemplate);
  }

  if (nextChannel) {
    params.set("channel", nextChannel);
  }

  const query = params.toString();
  return query ? `/dashboard/content/studio?${query}` : "/dashboard/content/studio";
}

export function appendQueryParam(href, key, value) {
  const params = new URLSearchParams();

  if (value) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${href}?${query}` : href;
}
