import assert from "node:assert/strict";
import { test } from "node:test";

const core = await import("./rev-ledger-sync-core.mjs").catch(() => ({}));

test("maps the live 2. REV columns without inventing a stable identity", () => {
  assert.equal(typeof core.mapRevRow, "function", "mapRevRow must be implemented");

  const mapped = core.mapRevRow(
    {
      Account: "  HM 잉글리쉬 ",
      Branch: "-",
      Location: "울산",
      Scale: "A",
      Importance: "Normal",
      Team: "BD",
      Manager: "Han",
      Status: "New",
      Type: "Direct",
      Product: "Hardware",
      "First Payment": "-",
      Remark: "",
      Sum: "¥ 20,000",
    },
    { rowNumber: 4, fiscalPeriod: "FY26-27" },
  );

  assert.deepEqual(
    {
      sourceRef: mapped.sourceRef,
      sourceKey: mapped.sourceKey,
      identityStatus: mapped.identityStatus,
      institutionName: mapped.institutionName,
      location: mapped.location,
      scale: mapped.scale,
      manager: mapped.manager,
      businessType: mapped.businessType,
      productType: mapped.productType,
      salesType: mapped.salesType,
      fiscalPeriod: mapped.fiscalPeriod,
      amount: mapped.amount,
      currencySymbol: mapped.currencySymbol,
    },
    {
      sourceRef: "row:4",
      sourceKey: null,
      identityStatus: "missing",
      institutionName: "HM 잉글리쉬",
      location: "울산",
      scale: "A",
      manager: "Han",
      businessType: "new",
      productType: "hw",
      salesType: "direct",
      fiscalPeriod: "FY26-27",
      amount: 20000,
      currencySymbol: "¥",
    },
  );
});

test("preserves the real REV product catalog without marking non-hardware products invalid", () => {
  const subscription = core.mapRevRow(
    { Account: "A", Scale: "B", Status: "Renew", Type: "Channel", Product: "Standard Subscription", Sum: "¥ 1,000" },
    { rowNumber: 3, fiscalPeriod: "FY26-27" },
  );
  const other = core.mapRevRow(
    { Account: "B", Scale: "C", Status: "New", Type: "Direct", Product: "Nobook", Sum: "¥ 2,000" },
    { rowNumber: 4, fiscalPeriod: "FY26-27" },
  );

  assert.equal(subscription.productType, "sw");
  assert.equal(subscription.productName, "Standard Subscription");
  assert.equal(other.productType, "other");
  assert.equal(other.productName, "Nobook");
  assert.notEqual(subscription.sourceHash, other.sourceHash);
});

test("source hash ignores row position and formatting-only whitespace", () => {
  assert.equal(typeof core.computeRevSourceHash, "function", "computeRevSourceHash must be implemented");

  const base = {
    institutionName: "HM 잉글리쉬",
    location: "울산",
    scale: "A",
    manager: "Han",
    businessType: "new",
    productType: "hw",
    salesType: "direct",
    fiscalPeriod: "FY26-27",
    amount: 20000,
    currencySymbol: "¥",
  };

  assert.equal(
    core.computeRevSourceHash({ ...base, sourceRef: "row:4" }),
    core.computeRevSourceHash({ ...base, institutionName: " HM   잉글리쉬 ", sourceRef: "row:44" }),
  );
});

test("source hash changes when the business amount changes", () => {
  assert.equal(typeof core.computeRevSourceHash, "function", "computeRevSourceHash must be implemented");

  const base = {
    institutionName: "HM 잉글리쉬",
    location: "울산",
    scale: "A",
    manager: "Han",
    businessType: "new",
    productType: "hw",
    salesType: "direct",
    fiscalPeriod: "FY26-27",
    amount: 20000,
    currencySymbol: "¥",
  };

  assert.notEqual(
    core.computeRevSourceHash(base),
    core.computeRevSourceHash({ ...base, amount: 25000 }),
  );
});

test("source revision is stable when sheet rows are reordered", () => {
  assert.equal(typeof core.computeRevSourceRevision, "function", "computeRevSourceRevision must be implemented");

  const rows = [
    { sourceKey: null, sourceRef: "row:3", sourceHash: "bbb", identityStatus: "missing" },
    { sourceKey: "rev-v1:abc", sourceRef: "row:4", sourceHash: "aaa", identityStatus: "ready" },
  ];

  assert.equal(core.computeRevSourceRevision(rows), core.computeRevSourceRevision([...rows].reverse()));
});

test("missing Moonlight ID does not make a valid new institution invalid", () => {
  assert.equal(typeof core.classifyRevRow, "function", "classifyRevRow must be implemented");

  const row = core.mapRevRow(
    {
      Account: "신규 학원",
      Location: "서울",
      Scale: "B",
      Manager: "Han",
      Status: "New",
      Type: "Direct",
      Product: "Hardware",
      Sum: "¥ 10,000",
    },
    { rowNumber: 9, fiscalPeriod: "FY26-27" },
  );
  const result = core.classifyRevRow(row, { companies: [], leads: [], sourceLinks: [] });

  assert.equal(result.classification, "new_candidate");
  assert.equal(result.identityStatus, "missing");
  assert.deepEqual(result.reasonCodes, []);
});

test("exact institution match fills only missing metadata", () => {
  assert.equal(typeof core.classifyRevRow, "function", "classifyRevRow must be implemented");

  const row = core.mapRevRow(
    {
      Account: "HM 잉글리쉬",
      Location: "울산",
      Scale: "A",
      Manager: "Han",
      Status: "New",
      Type: "Direct",
      Product: "Hardware",
      Sum: "¥ 20,000",
    },
    { rowNumber: 4, fiscalPeriod: "FY26-27" },
  );
  const result = core.classifyRevRow(row, {
    companies: [{ id: "company-1", name: "HM 잉글리쉬", meta: {} }],
    leads: [],
    sourceLinks: [],
  });

  assert.equal(result.classification, "matched_fill_empty");
  assert.deepEqual(result.candidateCompanyIds, ["company-1"]);
  assert.deepEqual(result.fillFields, ["location", "manager", "scale"]);
});

test("existing conflicting metadata requires approval", () => {
  assert.equal(typeof core.classifyRevRow, "function", "classifyRevRow must be implemented");

  const row = core.mapRevRow(
    {
      Account: "HM 잉글리쉬",
      Location: "울산",
      Scale: "A",
      Manager: "Han",
      Status: "Renew",
      Type: "Direct",
      Product: "Business Consumption",
      Sum: "¥ 30,000",
    },
    { rowNumber: 5, fiscalPeriod: "FY26-27" },
  );
  const result = core.classifyRevRow(row, {
    companies: [{ id: "company-1", name: "HM 잉글리쉬", meta: { region: "부산", scale: "B", rev_manager: "Kim" } }],
    leads: [],
    sourceLinks: [],
  });

  assert.equal(result.classification, "matched_requires_approval");
  assert.deepEqual(result.conflictFields, ["location", "manager", "scale"]);
  assert.deepEqual(result.reasonCodes, ["source_value_conflict"]);
});

test("suffix-only loose match is ambiguous and never auto-linked", () => {
  assert.equal(typeof core.classifyRevRow, "function", "classifyRevRow must be implemented");

  const row = core.mapRevRow(
    {
      Account: "온리원수학학원",
      Location: "서울",
      Scale: "C",
      Manager: "Han",
      Status: "New",
      Type: "Direct",
      Product: "Hardware",
      Sum: "¥ 5,000",
    },
    { rowNumber: 10, fiscalPeriod: "FY26-27" },
  );
  const result = core.classifyRevRow(row, {
    companies: [{ id: "company-2", name: "온리원수학", meta: {} }],
    leads: [],
    sourceLinks: [],
  });

  assert.equal(result.classification, "ambiguous");
  assert.deepEqual(result.candidateCompanyIds, ["company-2"]);
  assert.deepEqual(result.reasonCodes, ["multiple_company_candidates"]);
});

test("builds a read-only dry-run report from the live header shape", () => {
  assert.equal(typeof core.buildRevDryRunReport, "function", "buildRevDryRunReport must be implemented");

  const values = [
    ["Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Remark", "Sum"],
    ["HM 잉글리쉬", "-", "울산", "A", "Normal", "BD", "Han", "New", "Direct", "Hardware", "-", "", "¥ 20,000"],
    ["신규 학원", "-", "서울", "B", "Normal", "BD", "Han", "Renew", "Direct", "Business Consumption", "-", "", "¥ 10,000"],
  ];

  const report = core.buildRevDryRunReport({
    values,
    companies: [{ id: "company-1", name: "HM 잉글리쉬", meta: {} }],
    leads: [],
    sourceLinks: [],
    headerRowNumber: 2,
    fiscalPeriod: "FY26-27",
    batchId: "batch-1",
  });

  assert.equal(report.batchId, "batch-1");
  assert.equal(report.total, 2);
  assert.equal(report.institutionCount, 2);
  assert.equal(report.normalizedInstitutionCount, 2);
  assert.equal(report.identityReady, false);
  assert.equal(report.counts.matched_fill_empty, 1);
  assert.equal(report.counts.new_candidate, 1);
  assert.equal(report.rows[0].sourceRef, "row:3");
  assert.equal(report.rows[1].sourceRef, "row:4");
  assert.match(report.sourceRevision, /^[a-f0-9]{64}$/);
});

test("preserves the original sheet row number when blank rows are skipped", () => {
  const values = [
    ["Account", "Location", "Scale", "Manager", "Status", "Type", "Product", "Sum"],
    ["", "", "", "", "", "", "", ""],
    ["신규 학원", "서울", "B", "Han", "New", "Direct", "Hardware", "¥ 10,000"],
  ];

  const report = core.buildRevDryRunReport({ values, headerRowNumber: 2, fiscalPeriod: "FY26-27" });

  assert.equal(report.rows[0].sourceRef, "row:4");
});
