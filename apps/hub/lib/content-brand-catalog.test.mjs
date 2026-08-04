import assert from "node:assert/strict";
import { test } from "node:test";

let contentBrands = null;

try {
  contentBrands = await import("./content-brand-catalog.js");
} catch {
  // First red run: the three-lane content catalog does not exist yet.
}

test("content brand catalog module exists", () => {
  assert.ok(contentBrands, "content-brand-catalog.js must exist");
});

test("keeps the three ClassIn content lanes in canonical order", () => {
  assert.deepEqual(contentBrands.CONTENT_BRAND_LANES, [
    { key: "classmoon", label: "Class.Moon", order: 60, orgScope: "classin" },
    { key: "classin_side", label: "ClassIn Side", order: 65, orgScope: "classin" },
    { key: "studyseagull", label: "Study.Seagull", order: 70, orgScope: "classin" },
  ]);
});

test("builds per-lane live counts without hiding missing brand rows", () => {
  assert.deepEqual(
    contentBrands.buildContentBrandCatalog({
      source: "supabase",
      brands: [
        { id: "brand-classmoon", key: "classmoon" },
        { id: "brand-study", key: "studyseagull" },
      ],
      items: [
        { id: "i1", brandKey: "classmoon", status: "idea" },
        { id: "i2", brandId: "brand-classmoon", status: "draft" },
        { id: "i3", brandKey: "classin_side", status: "published" },
        { id: "i4", brandKey: "studyseagull", status: "review" },
        { id: "i5", brandKey: "another-brand", status: "idea" },
      ],
      publishLogs: [
        { id: "l1", brandId: "brand-classmoon", status: "failed" },
        { id: "l2", brandKey: "studyseagull", status: "published" },
      ],
    }),
    {
      state: "live",
      outsideLaneCount: 1,
      lanes: [
        {
          key: "classmoon",
          label: "Class.Moon",
          order: 60,
          orgScope: "classin",
          brandId: "brand-classmoon",
          connection: "live",
          counts: { total: 2, ideas: 1, inProduction: 1, scheduled: 0, published: 0, failed: 1 },
        },
        {
          key: "classin_side",
          label: "ClassIn Side",
          order: 65,
          orgScope: "classin",
          brandId: null,
          connection: "missing",
          counts: { total: 1, ideas: 0, inProduction: 0, scheduled: 0, published: 1, failed: 0 },
        },
        {
          key: "studyseagull",
          label: "Study.Seagull",
          order: 70,
          orgScope: "classin",
          brandId: "brand-study",
          connection: "live",
          counts: { total: 1, ideas: 0, inProduction: 1, scheduled: 0, published: 0, failed: 0 },
        },
      ],
    },
  );
});

test("keeps preview lane metadata but withholds operational counts", () => {
  assert.deepEqual(
    contentBrands.buildContentBrandCatalog({
      source: "preview",
      brands: [{ id: "fixture-brand", key: "classmoon" }],
      items: [{ id: "fixture-item", brandKey: "classmoon", status: "published" }],
      publishLogs: [{ id: "fixture-log", brandKey: "classmoon", status: "failed" }],
    }),
    {
      state: "preview",
      outsideLaneCount: null,
      lanes: contentBrands.CONTENT_BRAND_LANES.map((lane) => ({
        ...lane,
        brandId: null,
        connection: "preview",
        counts: null,
      })),
    },
  );
});

test("filters the operator-home ledger to the three ClassIn lanes", () => {
  assert.deepEqual(
    contentBrands.filterContentLedgerToBrandLanes({
      source: "supabase",
      brands: [
        { id: "brand-classmoon", key: "classmoon" },
        { id: "brand-personal", key: "moonpm" },
      ],
      items: [
        { id: "classin-item", brandId: "brand-classmoon", status: "draft" },
        { id: "personal-item", brandId: "brand-personal", status: "review" },
      ],
      publishLogs: [
        { id: "classin-log", brandKey: "studyseagull", status: "failed" },
        { id: "personal-log", brandId: "brand-personal", status: "failed" },
      ],
    }),
    {
      source: "supabase",
      brands: [
        { id: "brand-classmoon", key: "classmoon" },
        { id: "brand-personal", key: "moonpm" },
      ],
      items: [{ id: "classin-item", brandId: "brand-classmoon", status: "draft" }],
      publishLogs: [{ id: "classin-log", brandKey: "studyseagull", status: "failed" }],
    },
  );
});
