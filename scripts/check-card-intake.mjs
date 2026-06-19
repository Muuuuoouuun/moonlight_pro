#!/usr/bin/env node

// Unit checks for the pure business-card → intake logic.
// No framework, no IO — mirrors the repo's other `check:*` scripts.

import process from "node:process";

import { buildCardIntake } from "../apps/hub/lib/card-intake-core.js";

let failed = 0;
const ok = (name, cond) => {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${name}`);
  if (!cond) failed += 1;
};

// full card -> promote, phone match_key
const a = buildCardIntake({ name: "김원장", company: "클래스인학원", phone: "010-1234-5678", email: "k@a.com", title: "원장", address: "서울" });
ok("full card disposition=promote", a.disposition === "promote");
ok("phone normalized in match_key", a.matchKey === "phone:01012345678");
ok("normalized.contact_name=person", a.normalized.contact_name === "김원장");
ok("normalized.name=company", a.normalized.name === "클래스인학원");
ok("normalized.email", a.normalized.email === "k@a.com");
ok("normalized.title", a.normalized.title === "원장");
ok("normalized.source=business_card", a.normalized.source === "business_card");

// 2 of {name(company), contact, phone} -> promote (email/title optional)
const b = buildCardIntake({ name: "이실장", company: "햇살학원", phone: null, email: null, title: null, address: null });
ok("company+contact (2 fields) disposition=promote", b.disposition === "promote");
ok("no phone -> name-based match_key", b.matchKey === "n:햇살학원");

// only person name, no company/phone -> review
const c = buildCardIntake({ name: "박대표", company: null, phone: null, email: null, title: null, address: null });
ok("single field disposition=review", c.disposition === "review");

// no person name & no phone -> rejected
const d = buildCardIntake({ name: null, company: "어딘가", phone: null, email: "x@y.com", title: null, address: null });
ok("no name/phone disposition=rejected", d.disposition === "rejected");

// blank person name trimmed to null; landline normalized
const e = buildCardIntake({ name: "  ", company: "클래스인", phone: "02-555-1212", email: null, title: null, address: "강남" });
ok("blank contact trimmed to null", e.normalized.contact_name === null);
ok("landline phone normalized", e.normalized.phone === "025551212");
ok("company+phone (2 fields) disposition=promote", e.disposition === "promote");

console.log(`\n[${failed ? "FAIL" : "PASS"}] card-intake: ${failed ? `${failed} failed` : "all checks passed"}`);
process.exit(failed ? 1 : 0);
