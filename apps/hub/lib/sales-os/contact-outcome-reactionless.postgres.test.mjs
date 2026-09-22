// record_contact_outcome_v1(0042) — 반응을 묻지 않는 채널의 기록이 실제 RPC에서 저장되는지.
// 공용 기록창은 회신 체크를 안 한 카톡·이메일·메모를 reaction: ""로 보낸다(contact-record.js).
// 0018은 빈 반응을 invalid-reaction으로 거절해 이 기록이 전부 실패했다(2026-09-23 병합 검증).
// macOS: initdb/pg_ctl spawn env에만 LC_ALL을 넣는다(CLAUDE.md 테스트 함정).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { REACTIONLESS_KINDS, buildContactRecordPayload } from "./contact-record.js";

const migrations = [
  new URL("../../../../supabase/migrations/20260716_0018_record_contact_outcome.sql", import.meta.url),
  new URL("../../../../supabase/migrations/20260923_0042_contact_outcome_reactionless.sql", import.meta.url),
];
const available = process.getuid?.() !== 0 && ["initdb", "pg_ctl", "psql"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
const W = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);

test("0042 lists exactly the reactionless kinds the form sends without a reaction", () => {
  const source = readFileSync(migrations[1], "utf8");
  const match = source.match(/v_reaction = '' and v_kind in \(([^)]*)\)/);
  assert.ok(match, "0042 must accept an empty reaction only for named kinds");
  const kinds = match[1].split(",").map((k) => k.trim().replaceAll("'", "")).sort();
  assert.deepEqual(kinds, [...REACTIONLESS_KINDS].sort());
});

test("record_contact_outcome_v1 saves reactionless channels and keeps conversation channels strict", { skip: available ? false : "PostgreSQL binaries and non-root user required" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "contact-outcome-pg-"));
  const data = join(directory, "data");
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", directory, "-p", "55497", "-U", "contact_test", "-d", "postgres"];
  const sql = (source) => execFileSync("psql", args, { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const localeEnv = { ...process.env, LC_ALL: process.env.LC_ALL || "C" };
  let started = false;
  const call = (payload) => JSON.parse(sql(`select public.record_contact_outcome_v1('${W}'::uuid, ${lit(payload.entityType)}, ${lit(payload.entityId)}::uuid, null, ${lit(payload.kind)}, ${lit(payload.summary)}, ${lit(payload.reaction)}, ${lit(payload.nextAction)}, ${lit(payload.nextActionAt)}, ${payload.dormant ? "true" : "false"});`));
  try {
    execFileSync("initdb", ["-D", data, "-U", "contact_test", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe", env: localeEnv });
    execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -p 55497 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe", env: localeEnv });
    started = true;
    sql(`create role anon; create role authenticated; create role service_role;
      create table public.crm_activities(id uuid primary key default gen_random_uuid(), workspace_id uuid, entity_type text, kind text, body text,
        reaction text check (reaction is null or reaction in ('positive','neutral','concern','rejected','no_response')),
        contact_id uuid, lead_id uuid, deal_id uuid, account_id uuid, occurred_at timestamptz);
      create table public.leads(id uuid primary key, workspace_id uuid, next_action text, last_touch_at timestamptz, updated_at timestamptz, meta jsonb);
      create table public.deals(id uuid primary key, workspace_id uuid, next_action text, last_activity_at timestamptz, updated_at timestamptz, meta jsonb);
      create table public.customer_accounts(id uuid primary key, workspace_id uuid, next_action text, updated_at timestamptz, meta jsonb);
      insert into public.leads values ('${LEAD}', '${W}', null, null, null, '{"last_reaction":"positive"}');`);
    for (const url of migrations) sql(readFileSync(url, "utf8"));

    // 폼이 실제로 만드는 페이로드 그대로 — "카톡 보냄, 아직 답 없음".
    const kakao = buildContactRecordPayload(
      { kind: "kakao", summary: "견적서 보냄", replied: false, followup: "dated", at: "2026-09-26", nextAction: "회신 확인" },
      { kind: "lead", id: LEAD },
    );
    assert.equal(kakao.reaction, "");
    const saved = call(kakao);
    assert.equal(saved.status, "saved", JSON.stringify(saved));
    assert.equal(sql(`select coalesce(reaction, 'NULL') from public.crm_activities where id = '${saved.activityId}';`), "NULL");
    // 발신 기록은 이전 통화의 마지막 반응을 지우지 않는다.
    assert.equal(sql(`select meta->>'last_reaction' from public.leads where id = '${LEAD}';`), "positive");
    assert.equal(sql(`select meta->>'next_action_at' from public.leads where id = '${LEAD}';`), "2026-09-26");

    const note = buildContactRecordPayload({ kind: "note", summary: "메모", followup: "dormant" }, { kind: "lead", id: LEAD });
    assert.equal(call(note).status, "saved");

    // 대화 채널은 여전히 반응 필수.
    const bareCall = call({ ...kakao, kind: "call", reaction: "" });
    assert.equal(bareCall.status, "invalid-input");
    assert.equal(bareCall.error, "invalid-reaction");

    // 회신 받은 카톡은 반응을 남기고 last_reaction을 갱신한다.
    const replied = buildContactRecordPayload(
      { kind: "kakao", summary: "답장 옴", replied: true, reaction: "concern", followup: "none", nextAction: "" },
      { kind: "lead", id: LEAD },
    );
    assert.equal(call(replied).status, "saved");
    assert.equal(sql(`select meta->>'last_reaction' from public.leads where id = '${LEAD}';`), "concern");
  } finally {
    if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "stop"], { stdio: "pipe", env: localeEnv });
    rmSync(directory, { recursive: true, force: true });
  }
});
