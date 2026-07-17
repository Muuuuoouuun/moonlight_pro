import assert from "node:assert/strict";
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

test("keeps inactive referenced relations out of selectors while retaining project labels", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  const activeAreas = [
    { id: "area-active", slug: "sales", name: "영업", status: "active" },
  ];
  const referencedAreas = [
    { id: "area-inactive", slug: "legacy-sales", name: "이전 영업", status: "archived" },
  ];
  const activeLeads = [
    { id: "lead-active", name: "활성 리드", status: "new" },
  ];
  const referencedLeads = [
    { id: "lead-lost", name: "종료 리드", status: "lost" },
  ];
  const activeAccounts = [
    { id: "account-active", name: "활성 고객", status: "active" },
  ];
  const referencedAccounts = [
    { id: "account-closed", name: "종료 고객", status: "closed" },
  ];

  assert.deepEqual(context.mapProjectAreas([...activeAreas, ...referencedAreas]), [
    { id: "area-active", name: "영업", slug: "sales", canonical: true },
  ]);
  assert.deepEqual(
    context.buildProjectEntities(
      [...activeLeads, ...referencedLeads],
      [...activeAccounts, ...referencedAccounts],
    ).map(({ key }) => key),
    ["lead:lead-active", "customer_account:account-active"],
  );

  const areaById = new Map(
    context.mergeProjectRelationRows(activeAreas, referencedAreas).map((row) => [row.id, row]),
  );
  const leadById = new Map(
    context.mergeProjectRelationRows(activeLeads, referencedLeads).map((row) => [row.id, row]),
  );
  const accountById = new Map(
    context.mergeProjectRelationRows(activeAccounts, referencedAccounts).map((row) => [row.id, row]),
  );
  const projects = context.mapProjectRows([
    {
      id: "project-lost-lead",
      area_id: "area-inactive",
      lead_id: "lead-lost",
      name: "종료 리드 프로젝트",
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
    },
    {
      id: "project-closed-account",
      area_id: "area-inactive",
      customer_account_id: "account-closed",
      name: "종료 고객 프로젝트",
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
    },
  ], { areaById, leadById, accountById });

  assert.deepEqual(
    projects.map(({ areaName, entityLabel }) => ({ areaName, entityLabel })),
    [
      { areaName: "이전 영업", entityLabel: "리드 · 종료 리드" },
      { areaName: "이전 영업", entityLabel: "고객 · 종료 고객" },
    ],
  );
});

test("collects unique sorted relation ids from the bounded project rows", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  assert.deepEqual(context.collectProjectReferenceIds([
    { area_id: "area-b", lead_id: "lead-a", customer_account_id: null },
    { area_id: "area-a", lead_id: "lead-a", customer_account_id: null },
    { area_id: "area-b", lead_id: null, customer_account_id: "account-b" },
    { area_id: null, lead_id: null, customer_account_id: "account-a" },
  ]), {
    areaIds: ["area-a", "area-b"],
    leadIds: ["lead-a"],
    accountIds: ["account-a", "account-b"],
  });
});

test("builds exact selector and optional referenced-relation fetch plans", () => {
  assert.ok(context, "project-ledger-context.js must exist");
  assert.deepEqual(context.buildProjectCatalogFetchPlan(), {
    areas: {
      table: "areas",
      options: {
        order: "name.asc",
        filters: [["status", "eq.active"]],
      },
    },
    leads: {
      table: "leads",
      options: {
        limit: 160,
        order: "name.asc",
        filters: [["status", "in.(new,qualified,nurturing,won)"]],
      },
    },
    accounts: {
      table: "customer_accounts",
      options: {
        limit: 80,
        order: "name.asc",
        filters: [["status", "in.(active,paused)"]],
      },
    },
  });

  assert.deepEqual(context.buildProjectReferenceFetchPlan([
    { area_id: "area-b", lead_id: "lead-a" },
    { area_id: "area-a", customer_account_id: "account-a" },
    { area_id: "area-b", lead_id: "lead-a" },
  ]), {
    areas: {
      table: "areas",
      options: {
        limit: 2,
        filters: [["id", "in.(area-a,area-b)"]],
      },
    },
    leads: {
      table: "leads",
      options: {
        limit: 1,
        filters: [["id", "in.(lead-a)"]],
      },
    },
    accounts: {
      table: "customer_accounts",
      options: {
        limit: 1,
        filters: [["id", "in.(account-a)"]],
      },
    },
  });
  assert.deepEqual(context.buildProjectReferenceFetchPlan([
    { area_id: "area-only" },
  ]), {
    areas: {
      table: "areas",
      options: {
        limit: 1,
        filters: [["id", "in.(area-only)"]],
      },
    },
  });
});

test("fetches referenced relations in parallel scope and degrades unavailable lookups to empty", async () => {
  assert.ok(context, "project-ledger-context.js must exist");
  const calls = [];
  const rowsByTable = {
    areas: [{ id: "area-inactive", name: "이전 영업", status: "archived" }],
    leads: null,
    customer_accounts: [{ id: "account-closed", name: "종료 고객", status: "closed" }],
  };

  const result = await context.fetchProjectReferenceRows([
    { area_id: "area-inactive", lead_id: "lead-lost" },
    { customer_account_id: "account-closed" },
  ], {
    fetchRows: async (table, options) => {
      calls.push({ table, options });
      return rowsByTable[table];
    },
    withWorkspaceFilters: (filters) => [["workspace_id", "eq.workspace-1"], ...filters],
  });

  assert.deepEqual(calls, [
    {
      table: "areas",
      options: {
        limit: 1,
        filters: [
          ["workspace_id", "eq.workspace-1"],
          ["id", "in.(area-inactive)"],
        ],
      },
    },
    {
      table: "leads",
      options: {
        limit: 1,
        filters: [
          ["workspace_id", "eq.workspace-1"],
          ["id", "in.(lead-lost)"],
        ],
      },
    },
    {
      table: "customer_accounts",
      options: {
        limit: 1,
        filters: [
          ["workspace_id", "eq.workspace-1"],
          ["id", "in.(account-closed)"],
        ],
      },
    },
  ]);
  assert.deepEqual(result, {
    areaRows: rowsByTable.areas,
    leadRows: [],
    accountRows: rowsByTable.customer_accounts,
  });
});
