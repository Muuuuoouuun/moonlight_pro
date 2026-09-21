// 빠른 메모의 저장·재확인 경로.
//
// 2026-09-20 이전에는 `/api/hub/memo-capture` → `notes` 테이블로 갔고, 사이드바 "메모"
// 페이지는 `/api/hub/journal` → `journal_entries` 를 읽었다. 즉 **빠른 메모로 적은 것이
// 메모 목록에 영원히 뜨지 않았다**(실측: notes 2행 / journal_entries 0행). 발췌→할 일·
// 콘텐츠 전환, 업무 연결, 검색 같은 후처리는 전부 journal 쪽에만 붙어 있어서 빠른 메모는
// 후처리 자체가 불가능했다.
//
// 운영자 확정(2026-09-20): 저장소를 하나로 통합한다. 빠른 메모도 journal 경로로 쓴다.
// 기존 memo-capture 라우트는 남겨 두되(외부·재시도 대비) UI 는 더 이상 쓰지 않는다.

import { MAX_MEMO_CHARS } from "./memo-capture.js";

export const MEMO_SAVED_EVENT = "moonlight:memo-saved";
export const memoHref = (id) => `/dashboard/work/memos?note=${encodeURIComponent(id)}`;

// 빠른 메모 초안을 journal 저장 명령으로 옮긴다.
// journal 은 라벨을 noteMeta.tags 로 받는다. scope·source 는 journal note 모델에 자리가
// 없어 전달하지 않는다 — 통합의 대가이고, 필요해지면 noteMeta 를 확장하는 쪽이 맞다.
export function journalSaveCommand(payload, { now = () => new Date().toISOString() } = {}) {
  return {
    action: "save",
    requestId: payload.id,
    entryId: payload.id,
    expectedRevision: 0,
    body: payload.body,
    title: payload.title || "",
    occurredAt: now(),
    noteMeta: {
      kind: "note",
      enhancement: "",
      ...(Array.isArray(payload.labels) && payload.labels.length ? { tags: payload.labels } : {}),
    },
    contexts: [],
  };
}

export async function saveMemoAndVerify(payload, fetchImpl = fetch) {
  if (typeof payload?.body === "string" && payload.body.length > MAX_MEMO_CHARS)
    throw new Error(`본문은 ${MAX_MEMO_CHARS.toLocaleString()}자까지 저장할 수 있습니다. 입력은 유지했습니다.`);

  let receipt;
  try {
    const response = await fetchImpl("/api/hub/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(journalSaveCommand(payload)),
      signal: AbortSignal.timeout(25000),
    });
    receipt = await response.json();
    if (receipt.status === "conflict")
      throw Object.assign(new Error("같은 메모가 다른 내용으로 이미 저장되어 있습니다. 기존 메모를 확인하세요. 입력은 유지했습니다."), { id: payload.id });
    if (response.status === 503 || receipt.status === "preview")
      throw new Error("서버 저장이 연결되지 않았습니다. 이 탭의 초안을 유지했습니다.");
    if (!response.ok || !["saved", "duplicate"].includes(receipt.status) || receipt.entry?.id !== payload.id)
      throw new Error("서버에 저장하지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
  } catch (error) {
    if (error.name === "TimeoutError" || error instanceof TypeError)
      throw new Error("저장 응답을 확인하지 못했습니다. 입력을 바꾸지 않고 다시 저장하면 같은 메모를 확인합니다.");
    throw error;
  }

  // 영수증만 믿지 않고 본문을 되읽어 확인한다(기존 계약 유지).
  try {
    const check = await fetchImpl(`/api/hub/journal?note=${encodeURIComponent(payload.id)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const verified = await check.json();
    if (!check.ok || verified.status !== "live" || verified.entry?.id !== payload.id || verified.entry?.body !== payload.body)
      throw new Error("read-back-mismatch");
    return { id: payload.id, status: receipt.status, memo: verified.entry };
  } catch {
    throw Object.assign(new Error("저장 응답은 받았지만 본문 재확인이 필요합니다. 입력을 유지했으니 다시 저장해 확인하세요."), { id: payload.id });
  }
}
