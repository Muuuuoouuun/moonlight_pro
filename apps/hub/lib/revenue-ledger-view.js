const COMMON_FIELDS = [
  "source",
  "configured",
  "workspaceId",
  "failedSources",
  "partialSources",
  "error",
  "retryable",
];

const VIEW_FIELDS = {
  overview: ["leads", "deals", "stages", "summary"],
  leads: ["leads"],
  deals: ["deals", "stages"],
  cases: ["cases"],
  accounts: ["accounts"],
  customers: ["leads", "deals", "accounts", "contacts"],
  heatmap: ["leads", "deals", "accounts", "companies"],
};

const FULL_SOURCE_FIELDS = ["leads", "deals", "accounts", "cases", "companies", "contacts"];
const VIEW_SOURCE_FIELDS = {
  overview: ["leads", "deals", "companies", "contacts"],
  leads: ["leads", "companies", "contacts"],
  deals: ["deals", "companies"],
  accounts: ["accounts", "deals"],
  cases: ["cases", "accounts"],
  customers: ["leads", "deals", "accounts", "companies", "contacts"],
  heatmap: ["leads", "deals", "accounts", "companies"],
};

export function getRevenueViewNeeds(view) {
  return new Set(VIEW_SOURCE_FIELDS[view] || FULL_SOURCE_FIELDS);
}

export function projectRevenueLedger(ledger, view) {
  const fields = VIEW_FIELDS[view];
  if (!fields) return ledger;

  return [...COMMON_FIELDS, ...fields].reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(ledger, field)) result[field] = ledger[field];
    return result;
  }, {});
}
