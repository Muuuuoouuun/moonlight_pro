// ClassIn operator context — facts that are stable enough to inject into
// Sheets intake, follow-up scoring, and Guru prompts.
//
// Keep this dependency-free so server repositories and plain Node checks can
// import the helpers without pulling in Next.js runtime code.

const TARGET_DEFAULTS = {
  baselineContracts: 6,
  baselineRevenueCny: 100000,
  monthlyContractTarget: 60,
  monthlyUnitTarget: 60,
  monthlyRevenueTargetCny: 300000,
  avgHardwareCny: 20000,
  softwareFirstRechargeCny: 10000,
};

function envNumber(name, fallback) {
  const raw = typeof process !== "undefined" ? process.env?.[name] : null;
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function lowerText(...values) {
  return values
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => v != null)
    .map((v) => String(v).toLowerCase())
    .join(" ");
}

function hasAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

export function getClassInTargets() {
  return {
    baselineContracts: envNumber("COM_MOON_CLASSIN_BASELINE_CONTRACTS", TARGET_DEFAULTS.baselineContracts),
    baselineRevenueCny: envNumber("COM_MOON_CLASSIN_BASELINE_REVENUE_CNY", TARGET_DEFAULTS.baselineRevenueCny),
    monthlyContractTarget: envNumber("COM_MOON_CLASSIN_MONTHLY_CONTRACT_TARGET", TARGET_DEFAULTS.monthlyContractTarget),
    monthlyUnitTarget: envNumber("COM_MOON_CLASSIN_MONTHLY_UNIT_TARGET", TARGET_DEFAULTS.monthlyUnitTarget),
    monthlyRevenueTargetCny: envNumber("COM_MOON_CLASSIN_MONTHLY_REVENUE_TARGET_CNY", TARGET_DEFAULTS.monthlyRevenueTargetCny),
    avgHardwareCny: envNumber("COM_MOON_CLASSIN_AVG_HARDWARE_CNY", TARGET_DEFAULTS.avgHardwareCny),
    softwareFirstRechargeCny: envNumber(
      "COM_MOON_CLASSIN_SOFTWARE_FIRST_RECHARGE_CNY",
      TARGET_DEFAULTS.softwareFirstRechargeCny,
    ),
  };
}

export function getClassInOperatorContext({ leadSourceMix = null, monthlyKpi = null } = {}) {
  return {
    lane: {
      key: "classin_sales",
      workspace: "classin",
      label: "ClassIn 회사 영업",
      note: "ClassIn은 현재 다니는 회사의 실전 영업 lane이며, Moonlight 전체/개인 사업과 구분한다.",
    },
    targets: getClassInTargets(),
    monthlyKpi,
    sourceMix: leadSourceMix || {
      expectedPrimary: "meta_ads_google_sheet",
      expectedShare: "95% 광고 리드, 나머지는 기존 고객 연락 또는 Threads",
    },
    sourcePriority: [
      "설명회 신청 리드",
      "Threads 관심 리드",
      "Meta 광고/마케팅팀 Sheet 리드",
      "기존 고객 만료·소진·저활용 리드",
    ],
    pipeline: {
      simplified: ["lead", "valid_lead", "pre_purchase", "contract", "collection", "customer_success"],
      legacyCrm: ["lead", "account", "opportunity", "quotation", "order", "collection"],
      legacyKpi: ["lead", "account", "opportunity", "solution", "visit"],
    },
    channels: {
      primary: ["문자", "카카오톡", "Threads DM", "전화"],
      noCentralRecordYet: true,
    },
    crm: {
      companyCrmWrite: false,
      companyCrmRead: true,
      fallback: "고객 계정 웹 관리자",
      moonlightAutoRecord: true,
      note: "회사 CRM에는 현재 push하지 않는다. Moonlight에서 초안/체크리스트/요약을 만들고 사람 손으로 반영한다.",
    },
    aiPolicy: {
      allowed: ["초안 생성", "데이터 분석", "패턴 탐지", "자동 기록", "루틴화", "승인 큐 제안"],
      humanGate: ["고객 직접 전달", "콘텐츠 직접 업로드"],
      forbiddenAutomation: ["회사 CRM push", "회사 CRM 자동 입력", "고객 무승인 발송"],
    },
    contentPatterns: [
      {
        pattern: "ClassIn 실사용 3~5초 레퍼런스 영상 + Threads",
        observed: "7.5만/3만/2.5만 조회, 문의 30개, 유효 6개, 결제 3곳",
      },
      {
        pattern: "포럼/행사/다큐/이슈 정리 + 짧은 영상 첨부",
        observed: "정보성 2순위, 성과 기복 있음",
      },
      {
        pattern: "유튜브 영상 큐레이션",
        observed: "정보성 보조 채널",
      },
    ],
    openClarifications: [
      "월 60의 기준이 계약 수인지 하드웨어 유닛 수인지, 리포트에서는 둘 다 병렬 추적한다.",
      "전자칠판 60대만 계산하면 120만 CNY 가능성이 있어 30만 CNY 목표와 분리 표기한다.",
    ],
  };
}

export function isMetaAdsLead(record = {}) {
  const meta = record.meta || record;
  const hay = lowerText(record.source, record.channel, meta.source, meta.source_family, meta.campaign, meta.campaign_name, meta.ad_name, meta.ad_id, meta.form_id, meta.note);
  return hasAny(hay, ["meta", "facebook", "fb", "lead ads", "leadgen", "광고", "캠페인"]);
}

export function isThreadsLead(record = {}) {
  const meta = record.meta || record;
  const hay = lowerText(record.source, record.channel, meta.source, meta.source_family, meta.note, meta.channel);
  return hasAny(hay, ["threads", "thread", "스레드"]);
}

export function isExplanationLead(record = {}) {
  const meta = record.meta || record;
  const hay = lowerText(meta.intent, meta.program, meta.form_name, meta.form_id, meta.note, meta.campaign, meta.campaign_name, meta.ad_name, record.name);
  return hasAny(hay, ["설명회", "세미나", "웨비나", "포럼", "briefing", "session", "webinar", "seminar", "event"]);
}

export function isValidLeadFlag(record = {}) {
  const meta = record.meta || record;
  const hay = lowerText(meta.validity, meta.valid, meta.status, record.status);
  return hasAny(hay, ["유효", "valid", "qualified", "적격", "가능"]);
}

export function classinLeadChannel(intake = {}) {
  const explicit = lowerText(intake.channel);
  if (explicit.includes("카톡") || explicit.includes("kakao")) return "kakao";
  if (explicit.includes("문자") || explicit.includes("sms")) return "sms";
  if (isThreadsLead(intake)) return "threads-dm";
  if (String(intake.source || "").toLowerCase() === "business_card") return "business-card";
  if (isMetaAdsLead(intake)) return "meta-ad";
  return "sheet-import";
}

export function classinLeadScore(intake = {}) {
  let score = 20;
  if (intake.phone) score += 15;
  if (intake.contact_name) score += 5;
  if (isMetaAdsLead(intake)) score += 10;
  if (isThreadsLead(intake)) score += 20;
  if (isExplanationLead(intake)) score += 30;
  if (isValidLeadFlag(intake)) score += 20;
  if (Number(intake.unit_count) > 0) score += Math.min(10, Number(intake.unit_count) * 2);
  if (Number(intake.revenue_cny) > 0) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classinNextAction(intake = {}) {
  if (isExplanationLead(intake)) return "설명회 신청 리드: 24시간 안에 문자/전화로 상담 슬롯 확정";
  if (isThreadsLead(intake)) return "Threads 관심 리드: DM 맥락 이어서 실사용 레퍼런스 1개 전달";
  if (isMetaAdsLead(intake)) return "광고 리드: 24시간 안에 문자+전화 1차 접촉";
  return "리드 출처 확인 후 다음 접촉 채널 정하기";
}

export function buildLeadSourceMix(leads = []) {
  const total = Array.isArray(leads) ? leads.length : 0;
  const counts = {
    total,
    metaAds: 0,
    threads: 0,
    existingCustomer: 0,
    googleSheets: 0,
    unknown: 0,
  };

  (Array.isArray(leads) ? leads : []).forEach((lead) => {
    const source = lowerText(lead.source, lead.channel, lead.meta?.source_family);
    if (isMetaAdsLead(lead)) counts.metaAds += 1;
    else if (isThreadsLead(lead)) counts.threads += 1;
    else if (hasAny(source, ["existing", "customer", "기존", "고객"])) counts.existingCustomer += 1;
    else if (hasAny(source, ["sheet", "google_sheets", "google sheets"])) counts.googleSheets += 1;
    else counts.unknown += 1;
  });

  return counts;
}
