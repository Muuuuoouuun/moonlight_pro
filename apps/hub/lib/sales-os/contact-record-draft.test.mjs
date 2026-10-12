import assert from "node:assert/strict";
import { test } from "node:test";

import { createRecordDraftStore, openRecordDraft } from "./contact-record-draft.js";

const KEY = "crm-record:lead:lead-1";

// 탭 저장소 흉내 — failAfter번 쓰고 나면 거절한다(용량 초과·중간에 막히는 창).
function tabStorage({ seed = {}, failAfter = Infinity } = {}) {
  const items = new Map(Object.entries(seed));
  let writes = 0;
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      writes += 1;
      if (writes > failAfter) throw new Error("QuotaExceededError");
      items.set(key, String(value));
    },
    removeItem: (key) => { items.delete(key); },
  };
}
const blockedStorage = () => {
  const refuse = () => { throw new Error("SecurityError"); };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
};

test("a working tab storage holds the draft and says so", () => {
  const tab = tabStorage();
  const store = createRecordDraftStore(() => tab);
  assert.equal(store.probe(), "tab");
  assert.equal(tab.items.size, 0, "probing leaves nothing behind");

  assert.equal(store.read(KEY), null);
  assert.equal(store.write(KEY, { summary: "견적 검토" }), "tab");
  assert.deepEqual(JSON.parse(tab.items.get(KEY)), { summary: "견적 검토" });
  assert.deepEqual(store.read(KEY), { value: { summary: "견적 검토" }, place: "tab" });

  // 새로고침 뒤(새 모듈 = 빈 메모리)에도 탭 저장소의 초안은 남아 있다.
  const reloaded = createRecordDraftStore(() => tab);
  assert.deepEqual(reloaded.read(KEY), { value: { summary: "견적 검토" }, place: "tab" });

  store.clear(KEY);
  assert.equal(store.read(KEY), null);
  assert.equal(tab.items.has(KEY), false);
});

test("a blocked storage keeps only a memory copy and never reports the tab", () => {
  const blocked = [
    () => blockedStorage(), // 메서드가 던지는 창(사생활 보호 등)
    () => { throw new Error("SecurityError"); }, // 접근만으로 던지는 창
    () => null, // 저장소가 아예 없는 환경
    undefined,
  ];
  for (const getStorage of blocked) {
    const store = createRecordDraftStore(getStorage);
    assert.equal(store.probe(), "memory");
    assert.equal(store.write(KEY, { summary: "막힌 창의 초안" }), "memory");
    assert.deepEqual(store.read(KEY), { value: { summary: "막힌 창의 초안" }, place: "memory" });
    store.clear(KEY);
    assert.equal(store.read(KEY), null);
  }
});

test("a write the tab refuses after a good probe is reported as memory, and the stale tab copy does not come back", () => {
  const tab = tabStorage({ failAfter: 2 }); // 점검 1번 + 첫 쓰기 1번까지만 받는다
  const store = createRecordDraftStore(() => tab);
  assert.equal(store.probe(), "tab");
  assert.equal(store.write(KEY, { summary: "처음" }), "tab");

  assert.equal(store.write(KEY, { summary: "고쳐 쓴 요약" }), "memory");
  // 탭에는 옛 값이 남아 있지만 되살리는 것은 최신(메모리) 사본이고, 곳도 메모리라고 말한다.
  assert.deepEqual(JSON.parse(tab.items.get(KEY)), { summary: "처음" });
  assert.deepEqual(store.read(KEY), { value: { summary: "고쳐 쓴 요약" }, place: "memory" });

  store.clear(KEY);
  assert.equal(store.read(KEY), null);
});

test("a temporarily rejected removal cannot restore a cleared draft, and a later write replaces it", () => {
  for (const failure of ["remove", "access", "missing"]) {
    const tab = tabStorage();
    let unavailable = false;
    const remove = tab.removeItem;
    tab.removeItem = (key) => {
      if (unavailable) throw new Error("SecurityError");
      remove(key);
    };
    const store = createRecordDraftStore(() => {
      if (unavailable && failure === "access") throw new Error("SecurityError");
      return unavailable && failure === "missing" ? null : tab;
    });
    store.write(KEY, { summary: "이미 제출한 기록" });
    unavailable = true;
    store.clear(KEY);
    unavailable = false;
    assert.equal(tab.items.has(KEY), true, "삭제가 막혀 탭에는 옛 초안이 남아 있다");
    assert.equal(store.read(KEY), null, "저장소 접근이 돌아와도 제출한 초안을 되살리지 않는다");
    assert.equal(store.write(KEY, { summary: "새 기록" }), "tab");
    assert.deepEqual(store.read(KEY), { value: { summary: "새 기록" }, place: "tab" }, "새 쓰기가 삭제 표시를 풀고 탭 사본을 읽는다");
    store.clear(KEY);
    assert.equal(store.read(KEY), null);
    assert.equal(tab.items.has(KEY), false);
  }
});

test("an unreadable tab entry falls back to the memory copy instead of throwing", () => {
  const tab = tabStorage({ seed: { [KEY]: "{not json" } });
  const store = createRecordDraftStore(() => tab);
  assert.equal(store.read(KEY), null);
  const other = "crm-record:deal:deal-9";
  assert.equal(store.write(other, { summary: "다른 고객" }), "tab");
  assert.equal(store.read(KEY), null, "drafts are kept per key");
});

const typed = { kind: "meeting", reaction: null, replied: false, summary: "운영자가 직접 쓴 긴 요약", body: "", nextAction: "", at: "2026-10-05", followup: "dated" };

test("a caller's prefill never overwrites a draft the operator typed", () => {
  // "했어요 · 기록"이 약속 문구를 요약에 미리 채워 열어도, 쓰던 초안이 있으면 초안이 이긴다.
  const opened = openRecordDraft({ stored: typed, draft: { summary: "견적서 보내기", nextAction: "계약서 초안 보내기" } });
  assert.equal(opened.restored, true);
  assert.equal(opened.seeded, false);
  assert.equal(opened.values.summary, "운영자가 직접 쓴 긴 요약");
  assert.equal(opened.values.kind, "meeting");
  assert.equal(opened.values.at, "2026-10-05");
  // 씨앗은 초안이 비워 둔 칸만 채운다.
  assert.equal(opened.values.nextAction, "계약서 초안 보내기");
  assert.equal(opened.values.replied, false);

  assert.deepEqual(openRecordDraft({ stored: typed }), { values: typed, restored: true, seeded: false });
});

test("a failed save reopened with its input wins over anything stored", () => {
  const failedForm = { ...typed, summary: "저장에 실패한 입력" };
  const opened = openRecordDraft({ stored: typed, draft: failedForm, failed: true });
  assert.deepEqual(opened, { values: failedForm, restored: false, seeded: false });
});

test("a prefill alone is a seed, not a restored draft", () => {
  assert.deepEqual(openRecordDraft({ draft: { summary: "견적서 보내기" } }), { values: { summary: "견적서 보내기" }, restored: false, seeded: true });
  assert.deepEqual(openRecordDraft({}), { values: null, restored: false, seeded: false });
  assert.deepEqual(openRecordDraft(), { values: null, restored: false, seeded: false });
  // failed는 입력이 있을 때만 뜻이 있다 — 입력 없이 실패 표시만 오면 쓰던 초안을 되살린다.
  assert.deepEqual(openRecordDraft({ stored: typed, failed: true }), { values: typed, restored: true, seeded: false });
});
