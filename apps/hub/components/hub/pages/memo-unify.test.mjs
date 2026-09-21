import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// 메모 저장소 통합 계약(2026-09-20~21).
//
// 통합 전: 빠른 메모(M·⌘K)는 `/api/hub/memo-capture` → `notes`, 사이드바 "메모" 페이지는
// `/api/hub/journal` → `journal_entries`. 빠른 메모로 적은 것이 메모 목록에 영원히 뜨지
// 않았고(실측: notes 2행 / journal_entries 0행), 발췌→할 일·콘텐츠 전환, 업무 연결, 검색
// 같은 후처리가 전부 journal 쪽에만 있어 빠른 메모는 후처리 자체가 불가능했다.
//
// 두 가지가 같이 지켜져야 통합이 성립한다.
//   ① 빠른 메모가 journal 경로로 쓴다 (notes 로 돌아가면 다시 사라진다)
//   ② 저장하면 목록이 즉시 갱신된다 — 목록은 ledger 가 아니라 검색 훅이 그리고
//      그 훅은 MEMO_CHANGED_EVENT 만 듣는다. 이 다리가 끊기면 새로고침 전까지 안 보인다.

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
// 주석에는 옛 경로 이름이 배경 설명으로 남아 있다. 실제 호출만 본다.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

test("빠른 메모가 journal 경로로 저장한다", async () => {
  const save = stripComments(await read("../../../lib/memo-save.js"));
  assert.match(save, /["']\/api\/hub\/journal["']/, "journal 저장 경로가 없다");
  assert.doesNotMatch(save, /\/api\/hub\/memo-capture/, "notes 로 가는 옛 경로가 남아 있다 — 메모 목록에서 다시 사라진다");
  assert.match(save, /action:\s*["']save["']/, "journal save 명령을 만들지 않는다");
  assert.match(save, /kind:\s*["']note["']/, "noteMeta.kind 가 note 가 아니다");
});

test("메모 화면이 저장 이벤트를 목록 갱신으로 잇는다", async () => {
  const page = await read("./memos.jsx");
  assert.match(page, /MEMO_SAVED_EVENT/, "빠른 메모 저장 이벤트를 듣지 않는다");
  assert.match(page, /addEventListener\(MEMO_SAVED_EVENT/, "저장 이벤트 리스너가 없다");
  // 목록을 그리는 쪽은 useMemoSearch 이고 그건 MEMO_CHANGED_EVENT 만 듣는다.
  assert.match(page, /dispatchEvent\(new Event\(MEMO_CHANGED_EVENT\)\)/, "검색 목록 갱신 이벤트로 잇지 않는다 — 새로고침해야만 보인다");
  assert.match(page, /removeEventListener\(MEMO_SAVED_EVENT/, "리스너를 정리하지 않는다");
});

test("본문 한계가 journal 저장 한계와 어긋나지 않는다", async () => {
  // journal 은 본문 20,000자까지 받는다(lib/journal.js). 캡처 쪽이 더 크면 저장 단계에서
  // 거부되고 사용자는 이유를 모른 채 긴 글을 잃는다.
  const capture = await read("../../../lib/memo-capture.js");
  const max = /MAX_MEMO_CHARS = (\d+)/.exec(capture);
  assert.ok(max, "MAX_MEMO_CHARS 를 찾지 못했다");
  assert.ok(Number(max[1]) <= 20000, `캡처 한계 ${max[1]} 가 journal 한계 20000 보다 크다`);
});
