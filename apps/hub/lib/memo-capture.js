import { isJournalTimestamp } from "./journal.js";
import { JOURNAL_TAG_LENGTH, JOURNAL_TAG_LIMIT, normalizeJournalTags } from "./journal-tags.js";

export const MEMO_DRAFT_KEY = "moonlight:memo-draft:v1";
// journal_entries 의 본문 한계가 20,000자다(`lib/journal.js` validateJournalInput).
// 빠른 메모가 journal 로 통합되면서 100,000 → 20,000 으로 맞춘다. 더 긴 글은
// 메모가 아니라 Studio 원고의 자리다.
export const MAX_MEMO_CHARS = 20000;
export const MAX_MEMO_TITLE_CHARS = 200;
export const MAX_MEMO_FILE_BYTES = 256 * 1024;
export const newMemoDraft = () => ({
  id: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  title: "",
  body: "",
  labels: "",
  scope: "personal",
  source: { type: "manual" },
});
export function memoCapturePayload(draft) {
  const labels = normalizeJournalTags(draft.labels.split(/[,，\n]/));
  if (
    !draft.body.trim() ||
    draft.body.length > MAX_MEMO_CHARS ||
    draft.body.includes("\0")
  )
    throw new Error("본문은 1~20,000자의 텍스트로 입력하세요.");
  if (typeof draft.title !== "string" || draft.title.length > MAX_MEMO_TITLE_CHARS)
    throw new Error(`제목은 ${MAX_MEMO_TITLE_CHARS}자 이내로 입력하세요.`);
  if (labels === null)
    throw new Error(`라벨은 ${JOURNAL_TAG_LIMIT}개까지, 하나당 ${JOURNAL_TAG_LENGTH}자 이내로 입력하세요.`);
  return {
    id: draft.id,
    occurredAt: draft.occurredAt,
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
      `빈 파일·바이너리 파일·${MAX_MEMO_CHARS.toLocaleString()}자를 넘는 파일은 가져올 수 없습니다.`,
    );
  return {
    body,
    title: file.name.replace(/\.(txt|md)$/i, "").slice(0, MAX_MEMO_TITLE_CHARS),
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
    if (draft.occurredAt !== undefined && !isJournalTimestamp(draft.occurredAt)) return null;
    // Older tab drafts have no journal timestamp. Upgrade once on restore; both
    // entry points persist this draft before sending the first save request.
    return { ...draft, occurredAt: draft.occurredAt ?? new Date().toISOString() };
  } catch {
    return null;
  }
}
