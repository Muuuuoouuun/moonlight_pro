import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterDealsByWorkspace,
  filterLeadsByWorkspace,
  filterProjectsByWorkspace,
} from "../components/hub/workspace-map.js";

const brands = [
  { key: "classmoon", orgScope: "classin" },
];

test("explicit brand project workspace cannot leak into classin through brand or keyword fallback", () => {
  const project = {
    id: "brand-project",
    workspace: "brand",
    brand: "classmoon",
    name: "ClassIn 광고 프로젝트",
  };

  assert.deepEqual(filterProjectsByWorkspace([project], "classin", brands), []);
  assert.deepEqual(filterProjectsByWorkspace([project], "brand", brands), [project]);
});

test("explicit classin project workspace cannot leak into brand through the all-brand fallback", () => {
  const project = {
    id: "classin-project",
    workspace: "classin",
    brand: "all",
    name: "내부 영업 프로젝트",
  };

  assert.deepEqual(filterProjectsByWorkspace([project], "brand", brands), []);
  assert.deepEqual(filterProjectsByWorkspace([project], "classin", brands), [project]);
});

test("projects without a valid explicit workspace retain brand fallback behavior", () => {
  const project = {
    id: "legacy-project",
    workspace: "legacy",
    brand: "classmoon",
    name: "기존 프로젝트",
  };

  assert.deepEqual(filterProjectsByWorkspace([project], "classin", brands), [project]);
  assert.deepEqual(filterProjectsByWorkspace([project], "brand", brands), []);
});

test("lead and deal filters retain their existing type lanes", () => {
  const companyLead = { id: "lead-1", type: "company" };
  const personalDeal = { id: "deal-1", type: "personal" };

  assert.deepEqual(filterLeadsByWorkspace([companyLead], "classin"), [companyLead]);
  assert.deepEqual(filterLeadsByWorkspace([companyLead], "brand"), []);
  assert.deepEqual(filterDealsByWorkspace([personalDeal], "brand"), [personalDeal]);
  assert.deepEqual(filterDealsByWorkspace([personalDeal], "classin"), []);
});

// ── 문자열 키 폴백 — 정본 org_scope 판정 (2609 감사 #6) ─────────────────────────
// content item은 brand 객체가 아니라 문자열 태그만 갖는 경우가 대부분이다. 이전 구현은
// 문자열 키를 무조건 personal로 판정해 ClassIn 콘텐츠 큐가 항상 0건이었다.

test("filterContentByWorkspace keeps classin-tagged items in the classin lane", async () => {
  const { filterContentByWorkspace } = await import("../components/hub/workspace-map.js");
  const items = [
    { id: "c1", brand: "classmoon", title: "ClassIn 카드뉴스" },
    { id: "c2", brandKey: "gore", title: "고래 릴스" },
    { id: "c3", workspace: "classin", title: "명시 태그" },
  ];
  assert.deepEqual(filterContentByWorkspace(items, "classin").map((c) => c.id), ["c1", "c3"]);
  assert.deepEqual(filterContentByWorkspace(items, "brand").map((c) => c.id), ["c2"]);
});

test("brandInWorkspace resolves canonical classin keys without live brand objects", async () => {
  const { brandInWorkspace } = await import("../components/hub/workspace-map.js");
  assert.equal(brandInWorkspace("classmoon", "classin"), true);
  assert.equal(brandInWorkspace("classmoon", "brand"), false);
  assert.equal(brandInWorkspace("gore", "brand"), true);
  assert.equal(brandInWorkspace("unknown-brand", "brand"), true); // 미지 키는 개인 레인
});
