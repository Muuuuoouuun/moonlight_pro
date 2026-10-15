import assert from "node:assert/strict";
import { test } from "node:test";

import { memoDraftPlace, memoRestoredCopy, nextMemoSeed, recordMemoLine, recordMemoPhase } from "./record-memo.js";
import { buildNoteSave, initialMemoContexts } from "../journal-client.js";
import { createJournalStore } from "../journal-browser-store.js";

// 준비된 메모 칸(연결됨 · 쓰던 글 있음)에서 시작해 한 가지씩 바꿔 본다.
const live = (patch = {}) => ({ boot: "ready", ready: true, source: "live", empty: false, ...patch });

test("the memo phase follows the journal writer — nothing reads as saved before the server answers", () => {
  assert.equal(recordMemoPhase(), "booting", "아무것도 모르면 확인 중이다");
  assert.equal(recordMemoPhase({ boot: "loading", ready: true, source: "live" }), "booting");
  assert.equal(recordMemoPhase({ boot: "ready", ready: false, source: "live" }), "booting", "작성기가 준비되기 전");
  assert.equal(recordMemoPhase({ boot: "error" }), "boot-error");
  assert.equal(recordMemoPhase(live({ empty: true })), "idle");
  assert.equal(recordMemoPhase(live()), "draft");
  assert.equal(recordMemoPhase(live({ busy: true, pending: true })), "saving");
  // 보냈지만 답을 못 받았다 — 실패도 저장됨도 아니다.
  assert.equal(recordMemoPhase(live({ pending: true, saveState: "error" })), "unconfirmed");
  assert.equal(recordMemoPhase(live({ conflict: true, saveState: "conflict" })), "conflict");
  assert.equal(recordMemoPhase(live({ saveState: "error" })), "failed");
  assert.equal(recordMemoPhase(live({ source: "preview" })), "preview");
  assert.equal(recordMemoPhase(live({ empty: true, attempted: true })), "missing");
  // 방금 저장이 확인됐고 칸이 비었다 — 다시 쓰기 시작하면 쓰는 중이다.
  assert.equal(recordMemoPhase(live({ empty: true, savedAt: "2026-09-30T01:52:00Z" })), "saved");
  assert.equal(recordMemoPhase(live({ empty: false, savedAt: "2026-09-30T01:52:00Z" })), "draft");
  // 실패 · 미확인은 저장 확인보다 앞선다(앞 메모가 저장됐어도 지금 메모의 실패를 가리지 않는다).
  assert.equal(recordMemoPhase(live({ saveState: "error", savedAt: "2026-09-30T01:52:00Z" })), "failed");
});

test("the save line says where the draft lives and never promises more than the tab", () => {
  const idle = recordMemoLine(live({ empty: true }));
  assert.deepEqual(idle.line, { progress: null, note: { tone: "hint", text: "닫아도 이 탭에 초안으로 남아요" } });
  assert.deepEqual(idle.primary, { label: "메모 저장", action: "save", disabled: false });
  assert.equal(idle.receipt, null);
  const draft = recordMemoLine(live());
  assert.equal(draft.line.note.text, "초안 · 이 탭 · 서버에는 아직 없어요");
  // 탭 저장소가 막힌 창(작성기의 localError) — '이 탭'이라고 하지 않는다.
  assert.equal(memoDraftPlace({ localError: true }), "memory");
  assert.equal(recordMemoLine(live({ localError: true })).line.note.text, "초안 · 새로고침 전까지 · 서버에는 아직 없어요");
  assert.equal(recordMemoLine(live({ empty: true, localError: true })).line.note.text, "닫아도 초안으로 남아요 · 새로고침하면 사라져요");
  assert.equal(memoRestoredCopy(), "초안 · 이 탭 · 쓰던 메모를 불러왔어요");
  assert.equal(memoRestoredCopy({ localError: true }), "초안 · 새로고침 전까지 · 쓰던 메모를 불러왔어요");
  for (const plan of [idle, draft]) assert.doesNotMatch(JSON.stringify(plan), /이 기기|저장됨|기록됨/);
});

test("in flight the primary is the only dead button, and the line says why", () => {
  const booting = recordMemoLine({ boot: "loading" });
  assert.deepEqual(booting.line, { progress: { label: "메모 저장소 확인 중", canUndo: false }, note: null });
  assert.deepEqual(booting.primary, { label: "메모 저장", action: null, disabled: true });
  const saving = recordMemoLine(live({ busy: true, pending: true }));
  assert.deepEqual(saving.line, { progress: { label: "저장 중", canUndo: false }, note: null });
  assert.deepEqual(saving.primary, { label: "저장 중…", action: null, disabled: true });
  assert.doesNotMatch(JSON.stringify(saving), /저장됨/);
  // 연결 전에는 저장할 길이 없다 — 눌러도 아무 일 없는 '메모 저장'을 두지 않는다(이유는 저장 줄이 말한다).
  for (const state of [live({ source: "preview" }), live({ source: "preview", empty: true })]) {
    const preview = recordMemoLine(state);
    assert.deepEqual(preview.primary, { label: "저장할 수 없음", action: null, disabled: true });
    assert.match(preview.line.note.text, /^Preview · 연결 필요 — 메모가 저장되지 않아요\./, "죽은 버튼 옆에 이유가 선다");
  }
  // 그 밖의 어떤 상태에서도 주 버튼은 눌린다 — 왜 안 되는지는 눌렀을 때 말한다.
  const states = [live(), live({ empty: true }), live({ pending: true }), live({ conflict: true }), live({ saveState: "error" }), { boot: "error" }];
  for (const state of states) assert.equal(recordMemoLine(state).primary.disabled, false, JSON.stringify(state));
});

test("failures keep the text and name the cause — a railed title, never a saved word", () => {
  const unconfirmed = recordMemoLine(live({ pending: true, saveState: "error", message: "저장을 확인하지 못했어요." }));
  assert.deepEqual(unconfirmed.line.note, {
    tone: "error", title: "저장 확인 못 함",
    text: "저장됐는지 확인하지 못했어요 — 같은 요청으로 다시 확인하면 두 번 생기지 않아요. 쓰던 글은 이 탭에 남아 있어요.",
  });
  assert.deepEqual(unconfirmed.primary, { label: "저장 결과 확인", action: "confirm", disabled: false });

  const failed = recordMemoLine(live({ saveState: "error", message: "입력이나 연결할 업무를 확인해 주세요." }));
  assert.deepEqual(failed.line.note, { tone: "error", title: "저장 못 함", text: "입력이나 연결할 업무를 확인해 주세요. 쓰던 글은 이 탭에 남아 있어요." });
  assert.equal(failed.primary.action, "save", "고친 뒤 다시 저장한다");
  assert.equal(recordMemoLine(live({ saveState: "error" })).line.note.text, "메모를 저장하지 못했어요. 쓰던 글은 이 탭에 남아 있어요.");
  // 탭 저장소까지 막혔으면 남는 곳을 부풀리지 않는다.
  assert.match(recordMemoLine(live({ saveState: "error", localError: true })).line.note.text, /쓰던 글은 이 창에 남아 있어요\(새로고침하면 사라져요\)\.$/);

  const conflict = recordMemoLine(live({ conflict: true, saveState: "conflict" }));
  assert.equal(conflict.line.note.title, "저장 못 함");
  assert.match(conflict.line.note.text, /^다른 창에서 이 메모를 먼저 저장했어요 — 내 글로 저장하면 그 저장본을 고쳐 써요\./);
  assert.deepEqual(conflict.primary, { label: "내 글로 저장", action: "overwrite", disabled: false });

  const bootError = recordMemoLine({ boot: "error", bootMessage: "메모를 불러오지 못했어요. 다시 시도해 주세요." });
  assert.deepEqual(bootError.line.note, { tone: "error", title: "메모 칸을 열지 못함", text: "메모를 불러오지 못했어요. 다시 시도해 주세요." });
  assert.deepEqual(bootError.primary, { label: "다시 불러오기", action: "reload", disabled: false });
  assert.match(recordMemoLine({ boot: "error" }).line.note.text, /메모 저장소를 확인하지 못했어요/);

  for (const plan of [unconfirmed, failed, conflict, bootError]) {
    assert.equal(plan.receipt, null);
    assert.doesNotMatch(JSON.stringify(plan), /저장됨|기록됨/);
  }
});

test("preview says nothing is saved; an empty memo says what is missing — neither is an error", () => {
  const preview = recordMemoLine(live({ source: "preview" }));
  assert.deepEqual(preview.line.note, { tone: "warn", text: "Preview · 연결 필요 — 메모가 저장되지 않아요. 쓰던 글은 이 탭에 남아 있어요." });
  assert.equal(recordMemoLine(live({ source: "preview", empty: true })).line.note.text, "Preview · 연결 필요 — 메모가 저장되지 않아요.");
  // 연결 전의 주 버튼은 눌리지 않으므로 '눌러 본 뒤'가 없다 — 같은 말이 같은 자리에 그대로 선다.
  assert.deepEqual(recordMemoLine(live({ source: "preview", attempted: true })).line, preview.line);
  const missing = recordMemoLine(live({ empty: true, attempted: true }));
  assert.deepEqual(missing.line.note, { tone: "missing", text: "메모를 한 줄 쓰면 저장돼요." });
  for (const plan of [preview, missing]) assert.notEqual(plan.line.note.tone, "error");
});

test("a confirmed save leaves a receipt with its time and says it was not counted as a contact", () => {
  const saved = recordMemoLine(live({ empty: true, savedAt: "2026-09-30T01:52:00Z" }));
  assert.deepEqual(saved.receipt, { phase: "saved", label: "메모 저장됨", time: "10:52", detail: "연락으로 세지 않았어요", settled: true });
  assert.deepEqual(saved.line, { progress: null, note: null }, "영수증이 글자 자리를 대신한다");
  assert.deepEqual(saved.primary, { label: "메모 저장", action: "save", disabled: false });
  // 작성기가 저장본을 든 채 다음 메모로 넘어가기 전(stored) — 저장된 글을 '서버에 없는 초안'이라고 하지 않는다.
  const handing = recordMemoLine(live({ stored: true, saveState: "saved" }));
  assert.equal(handing.phase, "saved");
  assert.equal(handing.receipt.label, "메모 저장됨");
  assert.equal(handing.receipt.time, "", "답을 받은 시각을 아직 모르면 시각을 지어내지 않는다");
  assert.equal(recordMemoLine(live({ stored: true, saveState: "error" })).phase, "failed", "저장본을 고치다 실패하면 실패다");
  // 다음 메모를 쓰기 시작하면 영수증이 물러나고 초안 글자가 선다.
  const next = recordMemoLine(live({ savedAt: "2026-09-30T01:52:00Z" }));
  assert.equal(next.receipt, null);
  assert.equal(next.line.note.text, "초안 · 이 탭 · 서버에는 아직 없어요");
});

test("the writer's own message shows only after a save was tried — its opening notices point at controls this pane lacks", () => {
  const opening = "시작한 업무 연결을 모두 확인하지 못했어요. 저장 전에 업무 연결에서 다시 선택해 주세요.";
  assert.equal(recordMemoLine(live({ message: opening })).line.note.text, "초안 · 이 탭 · 서버에는 아직 없어요");
  const blocked = recordMemoLine(live({ attempted: true, message: "저장소 연결을 다시 확인한 뒤 이전 요청을 확인해 주세요." }));
  assert.deepEqual(blocked.line.note, { tone: "warn", text: "저장소 연결을 다시 확인한 뒤 이전 요청을 확인해 주세요." });
});

test("right after a confirmed save the next memo is handed over without falling back to 'checking' — the receipt stands at once", () => {
  const at = "2026-09-30T01:52:00Z";
  // 다음 메모의 작성기가 서는 한 박자(ready 전) — 넘겨받는 중이면 영수증이 곧바로 서고 주 버튼도 그대로다.
  assert.equal(recordMemoPhase({ boot: "ready", ready: false, source: "live", savedAt: at, handoff: true }), "saved");
  const handing = recordMemoLine({ boot: "ready", ready: false, source: "live", savedAt: at, handoff: true });
  assert.deepEqual(handing.receipt, { phase: "saved", label: "메모 저장됨", time: "10:52", detail: "연락으로 세지 않았어요", settled: true });
  assert.deepEqual(handing.line, { progress: null, note: null });
  assert.deepEqual(handing.primary, { label: "메모 저장", action: "save", disabled: false });
  assert.doesNotMatch(JSON.stringify(handing), /확인 중/);
  // 저장 확인 없이는(처음 열 때 · 모드를 옮길 때 · 저장본 그대로 두기 뒤) 준비 전은 확인 중이다 — 없는 저장을 말하지 않는다.
  assert.equal(recordMemoPhase({ boot: "ready", ready: false, source: "live", handoff: true }), "booting");
  assert.equal(recordMemoPhase({ boot: "ready", ready: false, source: "live", savedAt: at }), "booting");
  // 저장소 확인이 끝나지 않았거나 실패했으면 넘겨받기가 아니다.
  assert.equal(recordMemoPhase({ boot: "loading", savedAt: at, handoff: true }), "booting");
  assert.equal(recordMemoPhase({ boot: "error", savedAt: at, handoff: true }), "boot-error");
});

test("the next memo's empty draft is seeded from what the server just confirmed — the writer finds it and skips the context lookup", () => {
  const LEAD = "11111111-1111-4111-8111-111111111111";
  const NEXT = "22222222-2222-4222-8222-222222222222";
  const WORKSPACE = "33333333-3333-4333-8333-333333333333";
  const seeds = [{ type: "lead", id: LEAD, label: "메모 대상" }];
  const confirmed = [{ type: "lead", id: LEAD, label: "확인된 이름", description: "학원" }];
  const now = new Date("2026-09-30T01:52:00Z");
  const seed = nextMemoSeed({ id: NEXT, contexts: confirmed, seeds, now });
  // 빈 메모, 새 ID, 서버가 확인해 준 문맥 그대로. 쓰던 글이 아니다(dirty 아님) · 보낸 요청도 저장본도 없다.
  assert.deepEqual(seed, {
    draft: { id: NEXT, body: "", title: "", occurredAt: "2026-09-30T01:52:00.000Z", noteMeta: { kind: "note", enhancement: "", scope: "personal" }, contexts: confirmed, expectedRevision: 0 },
    entry: null, dirty: false, pending: null, reuseDraft: null,
  });
  // 그 초안으로 만든 요청은 같은 고객에 붙는 새 메모다.
  const request = buildNoteSave({ ...seed.draft, body: "다음 메모" }, "44444444-4444-4444-8444-444444444444");
  assert.deepEqual([request.entryId, request.expectedRevision, request.contexts], [NEXT, 0, [{ type: "lead", id: LEAD }]]);
  assert.deepEqual(initialMemoContexts(null, seeds).map((c) => c.id), [LEAD]);

  // 작성기의 탭 사본으로 읽힌다(journal-browser-store) — 작성기는 자기 사본이 있으면 문맥을 확인하러 가지 않는다.
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
  const store = createJournalStore({ storage, workspaceId: WORKSPACE, tabId: "tab-1" });
  store.write(NEXT, seed);
  const local = store.read(NEXT);
  assert.deepEqual(local.draft, seed.draft);
  assert.deepEqual([local.dirty, local.pending, local.entry], [false, null, null]);
  assert.deepEqual(store.list(), [], "빈 초안은 '쓰던 메모' 목록에 서지 않는다");
  // 탭 저장소가 막힌 창에서도 메모리 사본으로 읽힌다.
  const full = { getItem: () => null, setItem() { throw new Error("QuotaExceededError"); }, removeItem() {} };
  const volatile = createJournalStore({ storage: full, workspaceId: WORKSPACE, tabId: "tab-2" });
  assert.throws(() => volatile.write(NEXT, seed));
  assert.equal(volatile.read(NEXT).volatile, true);
  volatile.remove(NEXT);

  // 문맥은 서버가 확인해 준 것만 쓴다 — 이 칸의 고객이 거기 없으면 세우지 않는다(작성기가 지금처럼 확인한다).
  assert.equal(nextMemoSeed({ id: NEXT, contexts: [], seeds, now }), null);
  assert.equal(nextMemoSeed({ id: NEXT, contexts: [{ type: "account", id: LEAD, label: "다른 종류" }], seeds, now }), null);
  assert.equal(nextMemoSeed({ id: NEXT, contexts: undefined, seeds, now }), null);
  assert.equal(nextMemoSeed({ id: NEXT, contexts: confirmed, seeds: [], now }), null, "붙일 고객이 없으면 세울 초안도 없다");
  assert.equal(nextMemoSeed({ id: "", contexts: confirmed, seeds, now }), null);
  assert.equal(nextMemoSeed(), null);
  // 저장된 메모에 다른 문맥(프로젝트 등)이 더 붙어 있어도 다음 메모에는 이 칸의 고객만 붙는다.
  const extra = nextMemoSeed({ id: NEXT, contexts: [{ type: "project", id: WORKSPACE, label: "도입" }, ...confirmed], seeds, now });
  assert.deepEqual(extra.draft.contexts, confirmed);
  // ID의 대소문자 차이로 놓치지 않는다.
  assert.deepEqual(nextMemoSeed({ id: NEXT, contexts: confirmed, seeds: [{ type: "lead", id: LEAD.replace(/1/g, "A") }], now }), null, "다른 고객의 문맥을 빌리지 않는다");
  const shouted = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  const lower = [{ type: "lead", id: shouted.toLowerCase(), label: "확인된 이름" }];
  assert.deepEqual(nextMemoSeed({ id: NEXT, contexts: lower, seeds: [{ type: "lead", id: shouted }], now }).draft.contexts, lower);
});

test("consecutive context memo saves keep their personal or company scope through the recovery seed", () => {
  const lead = "11111111-1111-4111-8111-111111111111";
  const contexts = [{ type: "lead", id: lead, label: "확인된 고객" }];
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const store = createJournalStore({ storage, workspaceId: "33333333-3333-4333-8333-333333333333", tabId: "scope-regression" });
  for (const scope of [undefined, "personal", "company"]) {
    const expectedScope = scope ?? "personal";
    let savedScope = scope;
    for (let round = 2; round <= 3; round++) {
      const id = `22222222-2222-4222-8222-${String(round).padStart(12, "0")}`;
      const seed = nextMemoSeed({ id, contexts, seeds: contexts, scope: savedScope });
      store.write(id, seed);
      const restored = store.read(id);
      const request = buildNoteSave({ ...restored.draft, body: `메모 ${round}` }, "44444444-4444-4444-8444-444444444444");
      assert.equal(request.noteMeta.scope, expectedScope, "복구 사본을 읽는 다음 메모도 같은 범위로 저장된다");
      savedScope = request.noteMeta.scope;
    }
  }
});
