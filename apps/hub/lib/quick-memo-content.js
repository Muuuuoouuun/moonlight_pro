import { memoCapturePayload } from "./memo-capture.js";
import { saveMemoAndVerify } from "./memo-save.js";
import { isCanonicalUuid } from "./uuid.js";

export const contentIdeaHref = id => `/dashboard/content/studio?item=${encodeURIComponent(id)}`;

// Keep the note and content identities in the tab draft before either write.
export function prepareMemoIdea(draft) {
  return {
    ...draft,
    destination: "idea",
    ideaContentId: isCanonicalUuid(draft.ideaContentId) ? draft.ideaContentId : crypto.randomUUID(),
    ideaVariantId: isCanonicalUuid(draft.ideaVariantId) ? draft.ideaVariantId : crypto.randomUUID(),
  };
}

export async function saveMemoAsIdeaAndVerify(draft, fetchImpl = fetch) {
  if (!isCanonicalUuid(draft.ideaContentId) || !isCanonicalUuid(draft.ideaVariantId))
    throw new Error("소재 저장 식별자를 준비하지 못했습니다. 입력은 유지했습니다.");
  const note = await saveMemoAndVerify(memoCapturePayload(draft), fetchImpl);
  try {
    const payload = {
      action: "idea",
      contentId: draft.ideaContentId,
      variantId: draft.ideaVariantId,
      body: draft.body,
      sourceNoteId: note.id,
      orgScope: draft.scope,
    };
    const response = await fetchImpl("/api/hub/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    const receipt = await response.json();
    if (!response.ok || !["saved", "duplicate"].includes(receipt.status) ||
      receipt.contentId !== draft.ideaContentId || receipt.variantId !== draft.ideaVariantId)
      throw new Error("idea-write-unverified");
    const check = await fetchImpl("/api/hub/content", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const ledger = await check.json();
    const item = ledger.items?.find(candidate => candidate.id === draft.ideaContentId);
    const variant = ledger.variants?.find(candidate => candidate.id === draft.ideaVariantId);
    if (!check.ok || ledger.source !== "supabase" || !["live", "partial"].includes(ledger.status) ||
      item?.sourceIdea !== draft.body || item?.sourceNoteId !== note.id || item?.orgScope !== draft.scope ||
      variant?.contentId !== draft.ideaContentId || variant?.body !== draft.body)
      throw new Error("idea-read-unverified");
    return { id: note.id, contentId: item.id, variantId: variant.id };
  } catch {
    throw Object.assign(new Error("원문 메모는 저장됐지만 소재 연결은 확인하지 못했습니다. 입력을 유지했으니 다시 보내면 같은 소재를 확인합니다."), { id: note.id });
  }
}
