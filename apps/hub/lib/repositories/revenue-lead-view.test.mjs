import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLeadTagSummary,
  resolveLeadEnrichmentView,
} from "../sales-os/lead-view.js";

test("keeps lead score separate from monetary value and exposes enrichment", () => {
  const lead = resolveLeadEnrichmentView({
      id: "lead-1",
      name: "메티우스 수학",
      status: "won",
      score: 83,
      next_action: "활용 상태와 갱신·업셀 기회 정리",
      source: "eeocrm",
      meta: {
        owner_scope: "junhyuk",
        enrichment: {
          pipeline: { lane: "customer_success" },
          tags: ["activity:meeting", "activity:calendar", "activity:info-session-public", "owner:junhyuk", "region:서울", "subject:math"],
          evidenceState: { engagement: "present", public: "present" },
          evidence: {
            activity: {
              calendar: { meeting: 2, call: 0, infoSession: 0, other: 1, latestAt: "2026-07-01T00:00:00.000Z" },
            },
            public: [{ url: "https://example.com", confidence: "high" }],
          },
        },
      },
  });

  assert.equal(lead.score, 83);
  assert.equal(lead.valueAmount, null);
  assert.equal(lead.owner, "Me");
  assert.equal(lead.priorityLane, "customer_success");
  assert.equal(lead.nextAction, "활용 상태와 갱신·업셀 기회 정리");
  assert.equal(lead.region, "서울");
  assert.deepEqual(lead.enrichmentTags, ["activity:meeting", "activity:calendar", "activity:info-session-public", "owner:junhyuk", "region:서울", "subject:math"]);
  assert.equal(lead.engagementState, "present");
  assert.equal(lead.publicEvidenceCount, 1);
  assert.equal(lead.activityEvidence.calendar.meeting, 2);
});

test("uses explicit monetary meta value without deriving money from score", () => {
  const lead = resolveLeadEnrichmentView({
      id: "lead-2",
      name: "예시",
      status: "new",
      score: 50,
      meta: { value: 2500000 },
  });

  assert.equal(lead.valueAmount, 2500000);
  assert.equal(lead.score, 50);
});

test("does not label an arbitrary external owner id as the operator", () => {
  const externalLead = resolveLeadEnrichmentView({
    id: "lead-other-owner",
    owner_id: "someone-else",
    source: "eeocrm",
    meta: {},
  });
  const localLead = resolveLeadEnrichmentView({
    id: "lead-local-owner",
    owner_id: "local-user-id",
    source: "manual",
    meta: {},
  });

  assert.equal(externalLead.owner, "Unassigned");
  assert.equal(localLead.owner, "Me");
});

test("groups subject, region, direct activity, and public signals without conflating them", () => {
  assert.deepEqual(buildLeadTagSummary([
    "subject:math",
    "subject:english",
    "region:경기-안양",
    "activity:meeting",
    "activity:calendar",
    "activity:info-session-public",
    "program:exam-prep",
    "channel:youtube",
  ]), {
    subjects: ["수학", "영어"],
    regions: ["경기-안양"],
    directActivities: ["미팅"],
    activitySources: ["캘린더"],
    publicSignals: ["공개 설명회"],
    programs: ["시험 대비"],
    channels: ["YouTube"],
  });
});
