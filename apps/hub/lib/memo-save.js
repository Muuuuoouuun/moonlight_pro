// Both memo entry points share the same durable receipt/read-back contract.
export const MEMO_SAVED_EVENT = "moonlight:memo-saved";
export const memoHref = (id) => `/dashboard/work/projects?view=memos&memo=note:${encodeURIComponent(id)}`;

export async function saveMemoAndVerify(payload, fetchImpl = fetch) {
  let receipt;
  try {
    const response = await fetchImpl("/api/hub/memo-capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    receipt = await response.json();
    if (receipt.status === "conflict")
      throw Object.assign(new Error("같은 메모가 다른 내용으로 이미 저장되어 있습니다. 기존 메모를 확인하세요. 입력은 유지했습니다."), { id: receipt.id });
    if (receipt.status === "preview" || receipt.error === "memo-engine-not-configured")
      throw new Error("서버 저장이 연결되지 않았습니다. 이 탭의 초안을 유지했습니다.");
    if (!response.ok || !["saved", "duplicate"].includes(receipt.status) || !receipt.id)
      throw new Error("서버에 저장하지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
  } catch (error) {
    if (error.name === "TimeoutError" || error instanceof TypeError)
      throw new Error("저장 응답을 확인하지 못했습니다. 입력을 바꾸지 않고 다시 저장하면 같은 메모를 확인합니다.");
    throw error;
  }
  try {
    const check = await fetchImpl(`/api/hub/memo-capture?id=${encodeURIComponent(receipt.id)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const verified = await check.json();
    if (!check.ok || verified.status !== "live" || verified.memo?.id !== receipt.id || verified.memo?.body !== payload.body)
      throw new Error("read-back-mismatch");
    return { id: receipt.id, status: receipt.status, memo: verified.memo };
  } catch {
    throw Object.assign(new Error("저장 응답은 받았지만 본문 재확인이 필요합니다. 입력을 유지했으니 다시 저장해 확인하세요."), { id: receipt.id });
  }
}
