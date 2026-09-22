import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from "../../../lib/memo-intake-tasks.js";
import { normalizePmsCommand } from "../../../../engine/lib/pms-command.ts";

// AI 후보에서 할 일을 만드는 나머지 두 화면이 서버 봉투를 읽는지 고정한다(2026-09-23).
//   ① 메모 패턴 분석 패널의 "할 일로 만들기"
//   ② 내 작업 상세 패널의 "AI 실행 3단계 쪼개기" → "추가"
// 둘 다 /api/hub/tasks 에 id 없이 POST하고 res.ok 만 봤다. 엔진 미설정이면 라우트가 HTTP 202 +
// status:"preview"를 돌려주므로(lib/pms-engine-client.js) 저장되지 않은 할 일이 "등록됨"으로 보였고,
// 재시도마다 새 id가 생겨 중복 할 일이 쌓였다. memo-envelope.test.mjs(메모 AI 액션 추출)와 같은 계약.

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
// memo-input.test.mjs 와 같은 방식: import 줄을 걷어내고 실제 소스의 핸들러를 평가한다. 훅은 렌더
// 사이에 값을 보존하는 최소 구현이라, 클릭 → 응답 → 다시 렌더를 실제 컴포넌트 코드로 따라갈 수 있다.
function evaluate(name, names, scope) {
  const source = read(name).replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  const compiled = ts.transpile(source, { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(scope), `${compiled}\nreturn { ${names.join(", ")} };`)(...Object.values(scope));
}
function mount(name, component, scope) {
  const slots = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: "fragment",
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
  };
  const Component = evaluate(name, [component], { ...scope, React })[component];
  return (props) => { cursor = 0; return Component(props); };
}
const kids = (node) => [node?.props?.children ?? []].flat(Infinity);
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? kids(node).map(text).join("") : "");
function findAll(node, predicate, out = []) {
  if (!node || typeof node !== "object") return out;
  if (predicate(node)) out.push(node);
  for (const child of kids(node)) findAll(child, predicate, out);
  return out;
}
const buttons = (tree, label) => findAll(tree, (n) => n.type === "Button" && text(n) === label);
const badges = (tree) => findAll(tree, (n) => n.type === "TruthBadge").map((n) => ({ state: n.props.state, label: n.props.label }));

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
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
const previewThenDuplicate = (body, n) => n === 1
  ? json({ status: "preview", error: "engine-not-configured", task: null }, 202)
  : json({ status: "duplicate", action: "create_task", task: { id: body.id } });
const primitives = { Button: "Button", Card: "Card", Badge: "Badge", Skeleton: "Skeleton", TruthBadge: "TruthBadge", Iconed: "Iconed" };
const deps = (fetchImpl) => ({ ...primitives, freezeTaskCommand, TASK_OUTCOME, saveTaskCommand: (command) => saveTaskCommand(command, fetchImpl) });
const createTask = (command) => normalizePmsCommand({ ...command, action: "create_task" }, { workspaceId: crypto.randomUUID(), ownerId: crypto.randomUUID() });

test("공용 판정: saved/duplicate + 같은 id + persisted 만 저장, preview는 따로, unknown은 실패가 아니다", async () => {
  const cases = [
    ["saved 201", (body) => json({ status: "saved", task: { id: body.id } }, 201), "saved"],
    ["duplicate", (body) => json({ status: "duplicate", task: { id: body.id } }), "saved"],
    ["preview 202", () => json({ status: "preview", error: "engine-not-configured" }, 202), "preview"],
    ["bare 2xx", () => json({}), "unknown"],
    ["다른 id 영수증", () => json({ status: "saved", task: { id: crypto.randomUUID() } }), "unknown"],
    ["persisted:false", (body) => json({ status: "saved", persisted: false, task: { id: body.id } }), "unknown"],
    ["invalid-input 400", () => json({ status: "invalid-input", error: "missing-title" }, 400), "failed"],
    ["conflict 409", () => json({ status: "conflict" }, 409), "failed"],
    ["shared secret 없음 503", () => json({ status: "error", error: "shared-secret-not-configured" }, 503), "unknown"],
    ["engine-unreachable 502", () => json({ status: "error", error: "engine-unreachable" }, 502), "unknown"],
    ["네트워크 예외", () => { throw new TypeError("fetch failed"); }, "unknown"],
  ];
  for (const [label, respond, expected] of cases) {
    const { fetchImpl } = recorder(respond);
    const { command } = freezeTaskCommand({ id: crypto.randomUUID(), task: "견적서 보내기" });
    const outcome = await saveTaskCommand(command, fetchImpl);
    assert.equal(outcome.status, expected, label);
    if (expected !== "saved") assert.match(outcome.error, /[가-힣]/, `${label}: 원인 문장 없이 실패를 그리면 안 된다`);
  }
  // unknown은 "확인 필요" — danger가 아닌 중립 partial, 재시도는 같은 내용으로 확인(§5.3).
  assert.deepEqual(TASK_OUTCOME.unknown, { truth: "partial", label: "결과 확인 필요", retry: "같은 내용으로 확인" });
  assert.equal(TASK_OUTCOME.preview.truth, "preview");
  assert.equal(TASK_OUTCOME.failed.truth, "error");
});

test("굳힌 명령은 id·제목을 덮어쓸 수 없고, 한 번 굳히면 다시 굳혀도 그대로다", () => {
  const item = { id: crypto.randomUUID(), task: "회신 일정 잡기" };
  const frozen = freezeTaskCommand(item, { id: crypto.randomUUID(), title: "다른 제목", projectId: crypto.randomUUID() });
  assert.equal(frozen.command.id, item.id);
  assert.equal(frozen.command.title, item.task);
  assert.equal(freezeTaskCommand(frozen, { projectId: crypto.randomUUID() }), frozen);
  const normalized = createTask(frozen.command);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.record.id, item.id);
});

test("패턴 패널: preview는 등록됨이 아니고, 재시도는 같은 id·같은 payload, 새 분석은 새 id", async () => {
  const { bodies, fetchImpl } = recorder(previewThenDuplicate);
  const Panel = mount("./memo-pattern-panel.jsx", "MemoPatternPanel", deps(fetchImpl));
  const { patternTaskCommand } = evaluate("./memo-pattern-panel.jsx", ["patternTaskCommand"], { ...deps(fetchImpl), React: {} });
  const pattern = () => ({ id: "pattern-1-x", kind: "sales_insight", title: "견적 지연", observation: "관찰", interpretation: "해석", actionableGuidance: "  견적서를 오늘 안에 보낸다  ", suggestedTarget: "task", evidenceQuotes: [] });
  const patterns = [pattern()];
  const props = { loading: false, error: null, patterns, onClose() {} };

  const command = patternTaskCommand(patterns[0], crypto.randomUUID());
  assert.equal(command.title, "견적서를 오늘 안에 보낸다");
  assert.match(command.description, /\[패턴 도출 근거 실행 태스크\]\n견적서를 오늘 안에 보낸다$/);
  assert.equal(createTask(command).ok, true, "엔진 create_task 계약을 통과해야 한다");

  const [create] = buttons(Panel(props), "할 일로 만들기");
  await create.props.onClick();
  let tree = Panel(props);
  assert.deepEqual(badges(tree).at(-1), { state: "preview", label: "Preview · 저장되지 않음" });
  assert.equal(buttons(tree, "할 일 등록됨").length, 0, "202 preview를 등록됨으로 그리면 안 된다");

  await buttons(tree, "다시 등록")[0].props.onClick();
  tree = Panel(props);
  const [done] = buttons(tree, "할 일 등록됨");
  assert.ok(done, "같은 id의 duplicate 영수증은 이미 저장된 것이다");
  assert.equal(done.props.disabled, true);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0], "재시도가 새 id를 만들면 중복 할 일이 생긴다");
  assert.equal(bodies[0].source, "memo-pattern");

  // 같은 패널에서 다시 분석하면(패널은 loading→live 동안 마운트 유지) 새 결과는 새 등록 대상이다.
  const rerun = { ...props, patterns: [pattern()] };
  tree = Panel(rerun);
  assert.equal(buttons(tree, "할 일 등록됨").length, 0, "이전 결과의 등록 상태가 새 패턴에 번지면 안 된다");
  await buttons(tree, "할 일로 만들기")[0].props.onClick();
  assert.notEqual(bodies[2].id, bodies[0].id);
});

test("패턴 패널: 응답 확인 불가는 중립 partial + '같은 내용으로 확인', 다음 행동이 비면 등록 불가", async () => {
  const { bodies, fetchImpl } = recorder(() => json({ status: "error", error: "shared-secret-not-configured" }, 503));
  const Panel = mount("./memo-pattern-panel.jsx", "MemoPatternPanel", deps(fetchImpl));
  const props = { loading: false, error: null, onClose() {}, patterns: [
    { id: "p1", title: "A", actionableGuidance: "후속 메일 보내기", evidenceQuotes: [] },
    { id: "p2", title: "B", actionableGuidance: "   ", evidenceQuotes: [] },
  ] };
  const [first, empty] = buttons(Panel(props), "할 일로 만들기");
  assert.equal(empty.props.disabled, true, "빈 제목은 엔진이 missing-title로 거절한다");
  await first.props.onClick();
  const tree = Panel(props);
  assert.deepEqual(badges(tree).at(-1), { state: "partial", label: "결과 확인 필요" });
  assert.equal(badges(tree).some((b) => b.state === "error"), false, "확인 불가를 실패(danger)로 그리면 안 된다");
  await buttons(tree, "같은 내용으로 확인")[0].props.onClick();
  assert.equal(bodies[1].id, bodies[0].id);
});

test("할 일 분해: preview·실패는 '분해 결과 없음'이 아니고, 추가는 봉투 판정·같은 id 재시도를 따른다", async () => {
  const { bodies, fetchImpl } = recorder(previewThenDuplicate);
  const persona = [];
  let reply = { state: "preview" };
  const created = [];
  const toasts = [];
  const Section = mount("./my-work.jsx", "TaskDecomposeSection", {
    ...deps(fetchImpl),
    requestPersonaChat: async (request) => { persona.push(request); return reply; },
    useToast: () => ({ success: (m) => toasts.push(m), error: (m) => toasts.push(m) }),
  });
  const projectId = crypto.randomUUID();
  const props = { task: { id: "task-1", title: "견적 마감", projectId, projectName: "영업" }, onTaskCreated: () => created.push(1) };

  await buttons(Section(props), "AI 실행 3단계 쪼개기")[0].props.onClick();
  let tree = Section(props);
  assert.deepEqual(badges(tree), [{ state: "preview", label: "Preview · AI 연결 필요" }]);
  assert.doesNotMatch(text(tree), /분해된 액션이 없습니다/, "AI 미연결을 빈 결과로 그리면 안 된다");

  reply = { state: "done", text: "1. 견적서 초안 쓰기\n2. 고객에게 보내기\n3. 회신 일정 잡기" };
  await buttons(tree, "다시 분해")[0].props.onClick();
  tree = Section(props);
  assert.equal(buttons(tree, "추가").length, 3);

  await buttons(tree, "추가")[0].props.onClick();
  tree = Section(props);
  assert.deepEqual(badges(tree), [{ state: "preview", label: "Preview · 저장되지 않음" }]);
  assert.equal(buttons(tree, "등록됨").length, 0, "202 preview를 등록됨으로 그리면 안 된다");
  assert.deepEqual([created.length, toasts.length], [0, 0], "저장 안 된 할 일로 목록을 새로 고치거나 성공 토스트를 띄우면 안 된다");

  await buttons(tree, "다시 등록")[0].props.onClick();
  tree = Section(props);
  assert.equal(buttons(tree, "등록됨").length, 1);
  assert.deepEqual(bodies[1], bodies[0], "재시도가 새 id를 만들면 중복 할 일이 생긴다");
  assert.deepEqual([bodies[0].title, bodies[0].projectId, bodies[0].source], ["견적서 초안 쓰기", projectId, "my-work-decompose"]);
  assert.equal(createTask(bodies[0]).ok, true, "엔진 create_task 계약을 통과해야 한다");
  assert.deepEqual([created.length, toasts.length], [1, 1]);

  // 접었다 다시 펼치면 AI를 다시 부르지 않는다 — 재분해는 새 id로 이미 등록한 후보를 되살린다.
  buttons(tree, "접기")[0].props.onClick();
  const calls = persona.length;
  buttons(Section(props), "분해한 액션 보기")[0].props.onClick();
  assert.equal(persona.length, calls);
  assert.equal(buttons(Section(props), "등록됨").length, 1);
});

test("화면 계약: 두 화면 모두 공용 봉투 경로를 쓰고 res.ok 단독 판정·장식 이모지가 없다", () => {
  const panel = read("./memo-pattern-panel.jsx");
  const myWork = read("./my-work.jsx");
  const section = myWork.slice(myWork.indexOf("function TaskDecomposeSection"), myWork.indexOf("function DealOutreachSection"));
  for (const [name, source] of [["memo-pattern-panel", panel], ["TaskDecomposeSection", section]]) {
    assert.match(source, /saveTaskCommand\(/, `${name}: 공용 봉투 판정 경로를 거치지 않는다`);
    assert.doesNotMatch(source, /fetch\(\s*["']\/api\/hub\/tasks/, `${name}: /api/hub/tasks 를 직접 POST하면 res.ok 판정으로 되돌아간다`);
    assert.doesNotMatch(source, /if \(res\.ok\)/, `${name}: res.ok 단독 판정`);
    assert.doesNotMatch(source, /[💡🔍💭🎯📌✨✕✓]/u, `${name}: 장식 이모지·기호`);
    assert.doesNotMatch(source, /<button\b/, `${name}: 원시 버튼 대신 Button primitive`);
    assert.doesNotMatch(source, /fontSize:\s*10(?![.\d])/, `${name}: 10px 텍스트는 크기 플로어 위반`);
    assert.doesNotMatch(source, /\b[2-9]px solid/, `${name}: 보더는 항상 1px`);
  }
  assert.doesNotMatch(panel, /var\(--surface-1\)/, "--surface-1 토큰은 없다 — Card 배경이 투명해진다");
  assert.match(myWork, /<TaskDecomposeSection key=\{item\.id\}/, "다른 할 일을 열면 이전 분해 후보가 남지 않아야 한다");
});
