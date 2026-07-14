import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildJunhyukLeadEnrichment,
  inferLeadTags,
  normalizeEntityName,
} from "./lead-enrichment.js";

test("normalizes academy names for exact owner-account matching", () => {
  assert.equal(normalizeEntityName(" 메티우스  수학 "), "메티우스수학");
  assert.equal(normalizeEntityName("Study-Sync"), "studysync");
});

test("infers conservative subject, organization, and explicit region tags", () => {
  assert.deepEqual(inferLeadTags({ companyName: "완재수학 평촌" }), [
    "org:academy",
    "region:경기-안양",
    "subject:math",
  ]);

  assert.deepEqual(inferLeadTags({ companyName: "NK인피니트 영수학원" }), [
    "org:academy",
    "subject:english",
    "subject:math",
  ]);

  assert.deepEqual(inferLeadTags({ companyName: "한밝국어학원" }), [
    "org:academy",
    "subject:korean",
  ]);
});

test("builds an owner-scoped customer-success score without changing the official stage", () => {
  const result = buildJunhyukLeadEnrichment({
    now: "2026-07-15T00:00:00.000Z",
    owner: {
      externalId: "3935704427463307",
      name: "문준혁",
      eeoCode: "EEO04186",
    },
    lead: {
      id: "lead-1",
      name: "메티우스 수학",
      status: "won",
      email: null,
      meta: { existing: true },
    },
    company: { id: "company-1", name: "메티우스 수학", phone: null },
    officialAccount: {
      externalId: "4355890092868352",
      name: "메티우스 수학",
      ownerId: "3935704427463307",
      matchType: "exact_name",
    },
    activity: {
      opportunities: 1,
      collections: 0,
      salesPerformance: 0,
      contacts: 1,
      calendar: { meeting: 1, call: 0, infoSession: 0, other: 1, latestAt: "2026-07-07T05:00:00.000Z" },
    },
    publicEvidence: [
      {
        url: "https://example.com/metius",
        confidence: "high",
        tags: ["region:서울", "subject:math"],
        facts: ["공식 운영 페이지 확인"],
      },
    ],
  });

  assert.equal(Object.hasOwn(result.patch, "status"), false);
  assert.equal(result.patch.meta.existing, true);
  assert.equal(result.patch.meta.enrichment.scope.ownerExternalId, "3935704427463307");
  assert.equal(result.patch.meta.enrichment.pipeline.lane, "customer_success");
  assert.ok(result.patch.score > 25);
  assert.match(result.patch.next_action, /갱신|업셀/);
  assert.ok(result.patch.meta.enrichment.tags.includes("activity:meeting"));
  assert.ok(result.patch.meta.enrichment.tags.includes("evidence:public-high"));
});

test("marks missing engagement as unknown instead of inferring zero intent", () => {
  const result = buildJunhyukLeadEnrichment({
    now: "2026-07-15T00:00:00.000Z",
    owner: { externalId: "3935704427463307", name: "문준혁" },
    lead: { id: "lead-2", name: "한밝국어학원", status: "won", meta: {} },
    company: { id: "company-2", name: "한밝국어학원" },
    officialAccount: {
      externalId: "4305055629755073",
      name: "한밝국어학원",
      ownerId: "3935704427463307",
      matchType: "exact_name",
    },
    activity: null,
    publicEvidence: [],
  });

  assert.equal(result.patch.meta.enrichment.evidenceState.engagement, "unknown");
  assert.ok(result.patch.meta.enrichment.tags.includes("engagement:unknown"));
  assert.equal(result.patch.meta.enrichment.score.components.engagement, null);
});

test("rejects records that are not proven to belong to Junhyuk", () => {
  assert.throws(
    () =>
      buildJunhyukLeadEnrichment({
        owner: { externalId: "3935704427463307", name: "문준혁" },
        lead: { id: "lead-3", name: "다른 학원", status: "new", meta: {} },
        company: { id: "company-3", name: "다른 학원" },
        officialAccount: {
          externalId: "external-3",
          name: "다른 학원",
          ownerId: "someone-else",
          matchType: "exact_name",
        },
      }),
    /owner mismatch/i,
  );
});

test("keeps a stable evidence fingerprint across run timestamps", () => {
  const input = {
    owner: { externalId: "3935704427463307", name: "문준혁" },
    lead: { id: "lead-4", name: "완재수학 평촌", status: "won", meta: {} },
    company: { id: "company-4", name: "완재수학 평촌" },
    officialAccount: {
      externalId: "4305055608947497",
      name: "완재수학 평촌",
      ownerId: "3935704427463307",
      matchType: "exact_name",
    },
    publicEvidence: [{ url: "https://example.com", confidence: "high", tags: ["region:경기-안양"] }],
  };
  const first = buildJunhyukLeadEnrichment({ ...input, now: "2026-07-15T00:00:00.000Z" });
  const second = buildJunhyukLeadEnrichment({ ...input, now: "2026-07-16T00:00:00.000Z" });

  assert.ok(first.enrichment.evidenceFingerprint);
  assert.equal(first.enrichment.evidenceFingerprint, second.enrichment.evidenceFingerprint);
});
