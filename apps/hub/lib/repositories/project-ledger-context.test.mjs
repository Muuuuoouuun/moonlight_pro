import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

let context = null;

try {
  context = await import("./project-ledger-context.js");
} catch {
  // Red phase: the operating ledger has no lossless project context mapper yet.
}

test("orders canonical active areas before legacy areas without inferring hierarchy", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  const areas = context.mapProjectAreas([
    { id: "legacy-z", slug: "legacy-z", name: "Zulu", status: "active" },
    { id: "content", slug: "content", name: "콘텐츠", status: "active" },
    { id: "sales", slug: "sales", name: "영업", status: "active" },
    { id: "personal", slug: "personal-projects", name: "개인 프로젝트", status: "active" },
    { id: "marketing", slug: "marketing", name: "마케팅", status: "active" },
    { id: "it", slug: "it", name: "IT", status: "active" },
    { id: "ai", slug: "ai-third-party-development", name: "AI 기반 서드파티 개발", status: "active" },
    { id: "legacy-a", slug: "legacy-a", name: "Alpha", status: "active" },
    { id: "paused", slug: "paused-area", name: "Paused", status: "paused" },
  ]);

  assert.deepEqual(areas, [
    { id: "sales", name: "영업", slug: "sales", canonical: true },
    { id: "marketing", name: "마케팅", slug: "marketing", canonical: true },
    { id: "content", name: "콘텐츠", slug: "content", canonical: true },
    { id: "it", name: "IT", slug: "it", canonical: true },
    { id: "ai", name: "AI 기반 서드파티 개발", slug: "ai-third-party-development", canonical: true },
    { id: "personal", name: "개인 프로젝트", slug: "personal-projects", canonical: true },
    { id: "legacy-a", name: "Alpha", slug: "legacy-a", canonical: false },
    { id: "legacy-z", name: "Zulu", slug: "legacy-z", canonical: false },
  ]);
});

test("builds stable lead and customer account selector keys and labels", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  assert.deepEqual(
    context.buildProjectEntities(
      [
        { id: "lead-b", name: "하늘 학원", status: "qualified" },
        { id: "lead-a", name: "가람 학원", status: "new" },
        { id: "lead-lost", name: "제외", status: "lost" },
      ],
      [
        { id: "account-b", name: "푸른 고객", status: "paused" },
        { id: "account-a", name: "나래 고객", status: "active" },
        { id: "account-closed", name: "제외", status: "closed" },
      ],
    ),
    [
      { key: "lead:lead-a", type: "lead", id: "lead-a", label: "리드 · 가람 학원", status: "new" },
      { key: "lead:lead-b", type: "lead", id: "lead-b", label: "리드 · 하늘 학원", status: "qualified" },
      { key: "customer_account:account-a", type: "customer_account", id: "account-a", label: "고객 · 나래 고객", status: "active" },
      { key: "customer_account:account-b", type: "customer_account", id: "account-b", label: "고객 · 푸른 고객", status: "paused" },
    ],
  );
});

test("keeps raw project fields separate from latest-update display fallbacks", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  const projects = context.mapProjectRows(
    [{
      id: "project-1",
      area_id: "area-1",
      brand_id: "brand-1",
      lead_id: "lead-1",
      customer_account_id: null,
      name: "고객 온보딩",
      summary: "",
      status: "active",
      priority: "high",
      progress: 15,
      next_action: "",
      due_at: "2026-08-01T00:00:00.000Z",
      owner_id: "owner-1",
      meta: { org_scope: "personal", tag: "customer" },
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    }],
    {
      brandById: new Map([["brand-1", { id: "brand-1", slug: "classmoon", orgScope: "classin" }]]),
      areaById: new Map([["area-1", { id: "area-1", name: "영업", slug: "sales" }]]),
      leadById: new Map([["lead-1", { id: "lead-1", name: "가람 학원", status: "qualified" }]]),
      accountById: new Map(),
      taskStats: new Map([["project-1", { total: 3, done: 1 }]]),
      updateStats: new Map([["project-1", {
        count: 2,
        latest: {
          summary: "업데이트 요약",
          progress: 80,
          nextAction: "업데이트 다음 행동",
          happenedAt: "2026-07-17T00:00:00.000Z",
        },
      }]]),
    },
  );

  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    id: "project-1",
    areaId: "area-1",
    areaName: "영업",
    brandId: "brand-1",
    brand: "classmoon",
    entityRef: { type: "lead", id: "lead-1" },
    entityLabel: "리드 · 가람 학원",
    orgScope: "personal",
    workspace: "brand",
    name: "고객 온보딩",
    status: "In progress",
    statusKey: "active",
    priority: "high",
    progress: 80,
    projectProgress: 15,
    due: "8. 1.",
    dueAt: "2026-08-01T00:00:00.000Z",
    owner: "Me",
    tag: "customer",
    tasks: 3,
    done: 1,
    changes: 2,
    summary: "업데이트 요약",
    projectSummary: "",
    nextAction: "업데이트 다음 행동",
    projectNextAction: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    createdAtLabel: "7. 1.",
    lastActivityAt: "2026-07-17T00:00:00.000Z",
    lastActivityLabel: "7. 17. 09:00",
  });
});

test("routes brand-null projects by validated org scope and uses only matched entity labels", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  const [project] = context.mapProjectRows(
    [{
      id: "project-2",
      area_id: null,
      brand_id: null,
      customer_account_id: "missing-account",
      name: "ClassIn 내부 프로젝트",
      status: "draft",
      meta: { org_scope: "classin" },
      created_at: "2026-07-01T00:00:00.000Z",
    }],
  );

  assert.equal(project.orgScope, "classin");
  assert.equal(project.workspace, "classin");
  assert.deepEqual(project.entityRef, { type: "customer_account", id: "missing-account" });
  assert.equal(project.entityLabel, null);
});

test("operating ledger fetches optional creation catalogs without making them the live gate", async () => {
  const source = await readFile(new URL("./operating-ledger.js", import.meta.url), "utf8");

  for (const table of ["areas", "leads", "customer_accounts"]) {
    assert.match(source, new RegExp(`fetchSupabaseRows\\(\\"${table}\\"`));
  }
  assert.match(source, /if \(!brandRows \|\| !projectRows \|\| !taskRows\)/);
  assert.doesNotMatch(
    source,
    /if \([^)]*(?:areaRows|leadRows|accountRows)[^)]*\)\s*\{\s*return/,
  );
  assert.ok((source.match(/areas: \[\]/g) || []).length >= 2);
  assert.ok((source.match(/projectEntities: \[\]/g) || []).length >= 2);
  assert.match(source, /areas,/);
  assert.match(source, /projectEntities,/);
});
