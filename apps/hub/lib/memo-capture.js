export const MEMO_DRAFT_KEY = "moonlight:memo-draft:v1";
// journal_entries 의 본문 한계가 20,000자다(`lib/journal.js` validateJournalInput).
// 빠른 메모가 journal 로 통합되면서 100,000 → 20,000 으로 맞춘다. 더 긴 글은
// 메모가 아니라 Studio 원고의 자리다.
export const MAX_MEMO_CHARS = 20000;
export const MAX_MEMO_FILE_BYTES = 256 * 1024;
export const newMemoDraft = () => ({
  id: crypto.randomUUID(),
  title: "",
  body: "",
  labels: "",
  scope: "personal",
  source: { type: "manual" },
});
export function memoCapturePayload(draft) {
  const labels = [
    ...new Set(
      draft.labels
        .split(/[,，\n]/)
        .map((s) => s.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ];
  if (
    !draft.body.trim() ||
    draft.body.length > MAX_MEMO_CHARS ||
    draft.body.includes("\0")
  )
    throw new Error("본문은 1~20,000자의 텍스트로 입력하세요.");
  if (labels.length > 12 || labels.some((s) => s.length > 40))
    throw new Error("라벨은 12개까지, 하나당 40자 이내로 입력하세요.");
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    labels,
    scope: draft.scope,
    source: draft.source,
  };
}
export async function readMemoFile(file) {
  if (!/\.(txt|md)$/i.test(file.name))
    throw new Error("TXT 또는 Markdown(.md) 파일을 선택하세요.");
  if (file.size > MAX_MEMO_FILE_BYTES)
    throw new Error("파일은 256KB 이하로 가져올 수 있습니다.");
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error("UTF-8 텍스트 파일로 저장한 뒤 다시 가져오세요.");
  }
  if (!body.trim() || body.includes("\0") || body.length > MAX_MEMO_CHARS)
    throw new Error(
      "빈 파일·바이너리 파일·100,000자를 넘는 파일은 가져올 수 없습니다.",
    );
  return {
    body,
    title: file.name.replace(/\.(txt|md)$/i, "").slice(0, 300),
    source: {
      type: "file",
      name: file.name,
      originalBody: body,
      modifiedAt: file.lastModified
        ? new Date(file.lastModified).toISOString()
        : null,
    },
  };
}
export function restoreMemoDraft(raw) {
  try {
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !value.draft ||
      typeof value.draft.id !== "string"
    )
      return null;
    const draft = value.draft;
    if (
      !["personal", "company"].includes(draft.scope) ||
      typeof draft.body !== "string" ||
      draft.body.length > MAX_MEMO_CHARS ||
      typeof draft.title !== "string" ||
      draft.title.length > 300 ||
      typeof draft.labels !== "string"
    )
      return null;
    if (!["manual", "file"].includes(draft.source?.type)) return null;
    return draft;
  } catch {
    return null;
  }
}
