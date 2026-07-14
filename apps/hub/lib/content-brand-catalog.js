// Pure content-lane catalog and summary helpers.

export const CONTENT_BRAND_LANES = [
  { key: "classmoon", label: "Class.Moon", order: 60, orgScope: "classin" },
  { key: "classin_side", label: "ClassIn Side", order: 65, orgScope: "classin" },
  { key: "studyseagull", label: "Study.Seagull", order: 70, orgScope: "classin" },
];

const CONTENT_LANE_KEYS = new Set(CONTENT_BRAND_LANES.map((lane) => lane.key));

function statusOf(item) {
  return item?.statusKey || item?.status || "";
}

function buildCounts(items, publishLogs) {
  return {
    total: items.length,
    ideas: items.filter((item) => statusOf(item) === "idea").length,
    inProduction: items.filter((item) => ["draft", "review"].includes(statusOf(item))).length,
    scheduled: items.filter((item) => statusOf(item) === "scheduled").length,
    published: items.filter((item) => statusOf(item) === "published").length,
    failed: publishLogs.filter((log) => log?.status === "failed").length,
  };
}

export function filterContentLedgerToBrandLanes(ledger = {}) {
  const brands = Array.isArray(ledger.brands) ? ledger.brands : [];
  const brandKeyById = new Map(
    brands
      .filter((brand) => brand?.id)
      .map((brand) => [brand.id, brand.key || brand.slug]),
  );
  const laneKeyOf = (record) => record?.brandKey || brandKeyById.get(record?.brandId) || null;

  return {
    ...ledger,
    items: (Array.isArray(ledger.items) ? ledger.items : []).filter((item) => CONTENT_LANE_KEYS.has(laneKeyOf(item))),
    publishLogs: (Array.isArray(ledger.publishLogs) ? ledger.publishLogs : []).filter((log) => CONTENT_LANE_KEYS.has(laneKeyOf(log))),
  };
}

export function buildContentBrandCatalog(ledger = {}) {
  const state = ledger.source === "supabase"
    ? "live"
    : (ledger.source === "error" || ledger.status === "error" ? "error" : "preview");

  if (state !== "live") {
    return {
      state,
      outsideLaneCount: null,
      lanes: CONTENT_BRAND_LANES.map((lane) => ({
        ...lane,
        brandId: null,
        connection: state,
        counts: null,
      })),
    };
  }

  const brands = Array.isArray(ledger.brands) ? ledger.brands : [];
  const items = Array.isArray(ledger.items) ? ledger.items : [];
  const publishLogs = Array.isArray(ledger.publishLogs) ? ledger.publishLogs : [];
  const brandKeyById = new Map(
    brands
      .filter((brand) => brand?.id)
      .map((brand) => [brand.id, brand.key || brand.slug]),
  );
  const laneKeyOf = (record) => record?.brandKey || brandKeyById.get(record?.brandId) || null;

  return {
    state,
    outsideLaneCount: items.filter((item) => !CONTENT_LANE_KEYS.has(laneKeyOf(item))).length,
    lanes: CONTENT_BRAND_LANES.map((lane) => {
      const brand = brands.find((candidate) => (candidate?.key || candidate?.slug) === lane.key);
      const laneItems = items.filter((item) => laneKeyOf(item) === lane.key);
      const laneLogs = publishLogs.filter((log) => laneKeyOf(log) === lane.key);

      return {
        ...lane,
        brandId: brand?.id || null,
        connection: brand ? "live" : "missing",
        counts: buildCounts(laneItems, laneLogs),
      };
    }),
  };
}
