import { MEMO_DRAFT_KEY, restoreMemoDraft } from "./memo-capture.js";
import { isCanonicalUuid } from "./uuid.js";

export function quickMemoDraftKey(context) {
  return `moonlight:quick-memo:v1:${encodeURIComponent(context)}`;
}

export function readQuickMemoDraft(storage, key) {
  if (key === MEMO_DRAFT_KEY) return null;
  const draft = restoreMemoDraft(storage.getItem(key));
  if (draft?.destination === "idea" &&
    (!isCanonicalUuid(draft.ideaContentId) || !isCanonicalUuid(draft.ideaVariantId))) return null;
  return draft && isCanonicalUuid(draft.id) && draft.source.type === "manual" &&
    !draft.title && !draft.labels && !draft.body.includes("\0") ? draft : null;
}

export function writeQuickMemoDraft(storage, key, draft) {
  if (draft.body) storage.setItem(key, JSON.stringify({ version: 1, draft }));
  else storage.removeItem(key);
}
