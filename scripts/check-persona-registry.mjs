#!/usr/bin/env node

// Unit checks for the Sales OS persona contract (pure logic) + drift guard against
// docs/sales-os/personas/registry.json. No framework, no live IO — mirrors check-sheets-normalize.

import { readFileSync } from "node:fs";
import process from "node:process";

import {
  PERSONA_CONTRACT,
  PERSONA_IDS,
  mergePersonas,
  normalizePersona,
  personaById,
} from "../apps/hub/lib/sales-os/persona-contract.js";

const failures = [];

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`[PASS] ${label}`);
  } else {
    console.log(`[FAIL] ${label}: expected ${e}, got ${a}`);
    failures.push(label);
  }
}

function ok(label, cond) {
  eq(label, Boolean(cond), true);
}

// --- contract shape ---
eq("contract ids in canonical order", PERSONA_CONTRACT.map((p) => p.id), PERSONA_IDS);
ok("each contract persona has required fields", PERSONA_CONTRACT.every(
  (p) => p.id && p.nameKo && p.role && p.emits && p.gate && p.file,
));
eq("personaById resolves", personaById("order")?.nameEn, "Dispatch");
eq("personaById unknown -> null", personaById("nope"), null);

// --- drift guard: contract must mirror registry.json ---
const registry = JSON.parse(
  readFileSync(new URL("../docs/sales-os/personas/registry.json", import.meta.url), "utf8"),
);
const regById = new Map(registry.personas.map((p) => [p.id, p]));
eq("registry ids match contract", registry.personas.map((p) => p.id), PERSONA_IDS);
for (const base of PERSONA_CONTRACT) {
  const reg = regById.get(base.id);
  eq(`drift ${base.id} emits`, base.emits, reg?.emits);
  eq(`drift ${base.id} gate`, base.gate, reg?.gate);
  eq(`drift ${base.id} role`, base.role, reg?.role);
  eq(`drift ${base.id} file`, base.file, reg?.file);
}

// --- normalizePersona ---
eq("normalize persona_id from config", normalizePersona({
  id: "a1", name: "세일즈", agent_type: "sales", status: "active",
  config: { persona_id: "sales", role: "딜", emits: "x", gate: "g", file: "f" },
}), { id: "sales", agentId: "a1", nameKo: "세일즈", role: "딜", emits: "x", gate: "g", file: "f", status: "active", source: "supabase" });
eq("normalize falls back to agent_type", normalizePersona({ agent_type: "order", config: {} })?.id, "order");
eq("normalize no id -> null", normalizePersona({ config: {} }), null);
eq("normalize non-object -> null", normalizePersona(null), null);

// --- mergePersonas ---
const empty = mergePersonas([]);
eq("merge empty -> 5 contract personas", empty.map((p) => p.id), PERSONA_IDS);
ok("merge empty -> all idle/contract", empty.every((p) => p.status === "idle" && p.source === "contract"));

const overlaid = mergePersonas([
  { id: "x", name: "세일즈", agent_type: "sales", status: "active", config: { persona_id: "sales" } },
]);
const sales = overlaid.find((p) => p.id === "sales");
eq("merge overlays live status", { status: sales.status, source: sales.source, agentId: sales.agentId }, { status: "active", source: "supabase", agentId: "x" });
eq("merge preserves order", overlaid.slice(0, 5).map((p) => p.id), PERSONA_IDS);
ok("merge keeps other personas idle", overlaid.find((p) => p.id === "order").status === "idle");

const withExtra = mergePersonas([
  { id: "e", name: "마케팅", agent_type: "marketing", status: "idle", config: { persona_id: "marketing" } },
]);
eq("merge appends forward-compat persona", withExtra.length, PERSONA_IDS.length + 1);
eq("merge extra persona last", withExtra[withExtra.length - 1].id, "marketing");

console.log("");
if (failures.length) {
  console.log(`[FAIL] persona-registry: ${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("[PASS] persona-registry: all checks passed");
}
