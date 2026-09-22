import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { saveMemoIntakeTasks } from "../../../lib/memo-intake-tasks.js";
import { normalizePmsCommand } from "../../../../engine/lib/pms-command.ts";

// 메모 화면의 두 쓰기·분석 경로가 서버 봉투를 읽는지 고정한다(2026-09-22).
//   ① 메모 AI 액션 추출 → 할 일 등록: 엔진 미설정이면 /api/hub/tasks 가 HTTP 202 + status:"preview"를
//      돌려준다. res.ok 만 보면 저장되지 않은 할 일이 "등록됨"으로 보이고, 재시도마다 새 id가
//      생겨 중복 할 일이 쌓인다.
//   ② 메모 분석(선택 분석·최근 7일 종합): 202 preview를 성공으로 읽으면 빈 결과(또는 연결 안내용
//      자리표시 패턴)가 실제 분석 결과처럼 그려진다.

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
// memo-input.test.mjs 와 같은 방식: import 줄을 걷어내고 실제 소스의 순수 함수만 평가한다.
function load(name, names, scope = {}) {
  const source = read(name).replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  const compiled = ts.transpile(source, { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(scope), `${compiled}\nreturn { ${names.join(", ")} };`)(...Object.values(scope));
}
const composerSource = read("./memo-composer.jsx");
const pageSource = read("./memos.jsx");
const { freezeMemoAction, registerMemoAction } = load("./memo-composer.jsx", ["freezeMemoAction", "registerMemoAction"], { React: {}, saveMemoIntakeTasks });
const { readPatternEnvelope } = load("./memos.jsx", ["readPatternEnvelope"], { React: {} });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const candidate = (task = "견적서 보내기") => ({ id: crypto.randomUUID(), task, status: "pending", error: null });
function recorder(respond) {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    assert.equal(url, "/api/hub/tasks");
    assert.equal(init.method, "POST");
    bodies.push(JSON.parse(init.body));
    return respond(bodies.at(-1), bodies.length);
  };
  return { bodies, fetchImpl };
}

test("할 일 등록 명령은 후보의 고정 id를 싣고 엔진 create_task 계약을 통과한다", () => {
  const projectId = crypto.randomUUID();
  const frozen = freezeMemoAction(candidate(), projectId);
  assert.equal(frozen.command.id, frozen.id);
  const normalized = normalizePmsCommand({ ...frozen.command, action: "create_task" }, { workspaceId: crypto.randomUUID(), ownerId: crypto.randomUUID() });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.record.id, frozen.id);
  assert.equal(normalized.record.project_id, projectId);
  // 한 번 굳힌 명령은 연결(프로젝트)이 바뀌어도 그대로 — 같은 id의 payload가 달라지면 엔진이 conflict로 거절한다.
  assert.equal(freezeMemoAction(frozen, crypto.randomUUID()), frozen);
});

test("202 preview는 등록됨이 아니라 preview이고, 재시도는 같은 id·같은 payload를 다시 보낸다", async () => {
  const frozen = freezeMemoAction(candidate(), null);
  const { bodies, fetchImpl } = recorder((body, n) => n === 1
    ? json({ status: "preview", error: "engine-not-configured", task: null }, 202)
    : json({ status: "duplicate", action: "create_task", task: { id: body.id } }));
  const first = await registerMemoAction(frozen, fetchImpl);
  assert.equal(first.status, "preview");
  assert.ok(first.error, "preview에도 운영자가 읽을 문장이 있어야 한다");
  const retry = await registerMemoAction(frozen, fetchImpl);
  assert.equal(retry.status, "saved", "같은 id의 duplicate 영수증은 이미 저장된 것이다");
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0], "재시도가 새 id를 만들면 중복 할 일이 생긴다");
  assert.equal(bodies[0].id, frozen.id);
});

test("저장 확인은 saved + 같은 id + persisted 일 때만이다", async () => {
  const cases = [
    ["saved", (body) => json({ status: "saved", task: { id: body.id } }, 201), "saved"],
    ["bare 2xx", () => json({}), "unknown"],
    ["다른 id 영수증", () => json({ status: "saved", task: { id: crypto.randomUUID() } }), "unknown"],
    ["persisted:false", (body) => json({ status: "saved", persisted: false, task: { id: body.id } }), "unknown"],
    ["invalid-input 400", () => json({ status: "invalid-input", error: "missing-title" }, 400), "failed"],
    ["shared secret 없음 503", () => json({ status: "error", error: "shared-secret-not-configured" }, 503), "unknown"],
    ["네트워크 예외", () => { throw new TypeError("fetch failed"); }, "unknown"],
  ];
  for (const [label, respond, expected] of cases) {
    const { fetchImpl } = recorder(respond);
    const outcome = await registerMemoAction(freezeMemoAction(candidate(), null), fetchImpl);
    assert.equal(outcome.status, expected, label);
    if (expected !== "saved") assert.ok(outcome.error, `${label}: 원인 문장 없이 실패를 그리면 안 된다`);
  }
});

test("분석 봉투: preview·실패를 성공(빈 결과)으로 읽지 않는다", () => {
  const placeholder = [{ id: "preview-pattern-1", title: "패턴 분석 엔진 프리뷰 모드" }];
  const preview = readPatternEnvelope({ ok: true, status: 202 }, { status: "preview", patterns: placeholder });
  assert.equal(preview.status, "preview");
  assert.deepEqual(preview.patterns, [], "preview 자리표시 패턴을 결과 행으로 그리면 안 된다");

  const live = readPatternEnvelope({ ok: true, status: 200 }, { status: "succeeded", patterns: [{ id: "p1" }] });
  assert.deepEqual([live.status, live.patterns.length], ["live", 1]);

  for (const [response, data] of [
    [{ ok: false, status: 502 }, { status: "failed", error: "engine-unreachable" }],
    [{ ok: false, status: 404 }, { status: "error", error: "records-not-found", message: "선택 또는 분석할 메모를 찾을 수 없습니다." }],
    [{ ok: false, status: 400 }, { status: "invalid-input", error: "payload-too-large" }],
    [{ ok: true, status: 200 }, {}],
    [{ ok: false, status: 500 }, null],
    [null, { error: "network" }],
  ]) {
    const outcome = readPatternEnvelope(response, data);
    assert.equal(outcome.status, "error", JSON.stringify(data));
    assert.deepEqual(outcome.patterns, []);
    assert.match(outcome.error, /[가-힣]/, "평문 원인이 한국어 문장이어야 한다");
  }
});

test("화면 계약: 봉투 판정 경로를 쓰고 장식 이모지·10px 원시 버튼이 없다", () => {
  assert.match(composerSource, /registerMemoAction\(frozen\)/, "할 일 등록이 봉투 판정 경로를 거치지 않는다");
  assert.doesNotMatch(composerSource, /if \(res\.ok\) \{\s*setAddedSet/, "res.ok 단독 판정으로 되돌아갔다");
  assert.doesNotMatch(composerSource, /<button\b/, "접기는 Button primitive여야 한다");
  assert.doesNotMatch(composerSource, /fontSize:\s*10(?![.\d])/, "10px 텍스트는 크기 플로어(10.5px) 위반이다");
  assert.doesNotMatch(composerSource, /✨/);
  assert.match(pageSource, /readPatternEnvelope\(res,/, "메모 분석이 봉투를 읽지 않는다");
  assert.match(pageSource, /TruthBadge state=\{patternState\.status\}/, "preview·error를 truth 상태로 그리지 않는다");
  assert.doesNotMatch(pageSource, /data\.status === 'failed'/, "failed만 실패로 보던 판정으로 되돌아갔다");
  assert.doesNotMatch(pageSource, /✦/);
});
