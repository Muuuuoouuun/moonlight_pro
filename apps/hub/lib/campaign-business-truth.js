export const CAMPAIGN_BUSINESS_TRUTH_VERSION = 1;

const COMPLETENESS_FIELDS = [
  "icp",
  "problem",
  "promise",
  "offer",
  "priceLabel",
  "primaryMetric",
  "weeklyTarget",
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNonNegativeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function truthSource(value) {
  const object = asObject(value);
  return asObject(object.business_truth || object.businessTruth || object);
}

export function normalizeCampaignBusinessTruth(value) {
  const raw = truthSource(value);

  return {
    version: CAMPAIGN_BUSINESS_TRUTH_VERSION,
    icp: cleanText(raw.icp),
    problem: cleanText(raw.problem),
    promise: cleanText(raw.promise),
    offer: cleanText(raw.offer),
    priceLabel: cleanText(raw.priceLabel ?? raw.price_label),
    primaryMetric: cleanText(raw.primaryMetric ?? raw.primary_metric),
    weeklyTarget: optionalNonNegativeNumber(raw.weeklyTarget ?? raw.weekly_target),
    weeklyActual: optionalNonNegativeNumber(raw.weeklyActual ?? raw.weekly_actual),
    wedge: cleanText(raw.wedge),
    enemy: cleanText(raw.enemy),
    updatedAt: cleanText(raw.updatedAt ?? raw.updated_at) || null,
  };
}

export function buildBusinessTruthMeta(existingMeta, input, now = new Date().toISOString()) {
  const meta = asObject(existingMeta);
  const truth = normalizeCampaignBusinessTruth(input);

  return {
    ...meta,
    business_truth: {
      version: CAMPAIGN_BUSINESS_TRUTH_VERSION,
      icp: truth.icp,
      problem: truth.problem,
      promise: truth.promise,
      offer: truth.offer,
      price_label: truth.priceLabel,
      primary_metric: truth.primaryMetric,
      weekly_target: truth.weeklyTarget,
      weekly_actual: truth.weeklyActual,
      wedge: truth.wedge,
      enemy: truth.enemy,
      updated_at: now,
    },
  };
}

export function businessTruthCompleteness(value) {
  const truth = normalizeCampaignBusinessTruth(value);
  const completed = COMPLETENESS_FIELDS.reduce((count, field) => {
    if (field === "weeklyTarget") {
      return count + (Number.isFinite(truth.weeklyTarget) && truth.weeklyTarget > 0 ? 1 : 0);
    }
    return count + (truth[field] ? 1 : 0);
  }, 0);

  return {
    completed,
    total: COMPLETENESS_FIELDS.length,
    percent: Math.round((completed / COMPLETENESS_FIELDS.length) * 100),
  };
}

export function buildWeeklyScorecard(value) {
  const truth = normalizeCampaignBusinessTruth(value);
  if (!truth.primaryMetric || !Number.isFinite(truth.weeklyTarget) || truth.weeklyTarget <= 0) {
    return null;
  }

  const hasActual = Number.isFinite(truth.weeklyActual);
  const actual = hasActual ? truth.weeklyActual : null;
  return {
    metric: truth.primaryMetric,
    target: truth.weeklyTarget,
    actual,
    gap: hasActual ? actual - truth.weeklyTarget : null,
    progress: hasActual
      ? Math.max(0, Math.min(100, Math.round((actual / truth.weeklyTarget) * 100)))
      : 0,
  };
}
