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

export function appendQueryParam(href, key, value) {
  const params = new URLSearchParams();

  if (value) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${href}?${query}` : href;
}
