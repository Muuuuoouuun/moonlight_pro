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
