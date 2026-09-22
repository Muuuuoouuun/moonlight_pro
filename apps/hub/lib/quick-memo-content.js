import { memoCapturePayload } from "./memo-capture.js";
import { saveMemoAndVerify } from "./memo-save.js";
import { selectedNoteExcerpt } from "./journal-client.js";
import { isCanonicalUuid } from "./uuid.js";

export const contentIdeaHref = id => `/dashboard/content/studio?item=${encodeURIComponent(id)}`;

// Keep the persisted draft identities for backward-compatible tab recovery.
// ideaContentId is now the journal handoff request ID; the RPC issues target IDs.
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
  const selection = selectedNoteExcerpt(draft.body, 0, draft.body.length);
  if (!selection)
    throw Object.assign(new Error("원문 메모는 저장됐습니다. 소재로 잇는 발췌는 3,500자까지 가능합니다. 저장된 메모를 열어 필요한 부분을 선택해 콘텐츠로 이어 주세요."), { id: note.id });
  try {
    // Quick capture creates revision 1. Keep that source revision fixed on retry,
    // even if another surface has since updated the saved note's metadata.
    const payload = {
      action: "create_content",
      requestId: draft.ideaContentId,
      entryId: note.id,
      expectedRevision: 1,
      selection,
      target: { title: draft.body.trim().split(/\r?\n/)[0].slice(0, 200), brandId: null, channel: "threads" },
    };
    const response = await fetchImpl("/api/hub/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    const receipt = await response.json();
    const { target, link } = receipt;
    const linkedToTarget = candidate => candidate?.id === link?.id && candidate?.targetType === "content"
      && candidate?.targetId === target?.id && candidate?.href === target?.href
      && candidate?.excerpt === draft.body && candidate?.sourceRevision === payload.expectedRevision;
    if (!response.ok || !["saved", "duplicate"].includes(receipt.status)
      || receipt.entry?.id !== note.id || target?.type !== "content"
      || !isCanonicalUuid(target.id) || !isCanonicalUuid(target.variantId) || !isCanonicalUuid(link?.id)
      || target.href !== `${contentIdeaHref(target.id)}&variant=${target.variantId}` || !linkedToTarget(link))
      throw new Error("idea-write-unverified");
    const journalCheck = await fetchImpl(`/api/hub/journal?note=${encodeURIComponent(note.id)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const journal = await journalCheck.json();
    if (!journalCheck.ok || journal.status !== "live" || journal.entry?.id !== note.id
      || journal.entry.body !== draft.body || !journal.entry.links?.some(linkedToTarget))
      throw new Error("idea-link-unverified");
    const check = await fetchImpl("/api/hub/content", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const ledger = await check.json();
    const item = ledger.items?.find(candidate => candidate.id === target.id);
    const variant = ledger.variants?.find(candidate => candidate.id === target.variantId);
    if (!check.ok || ledger.source !== "supabase" || !["live", "partial"].includes(ledger.status)
      || item?.sourceIdea !== draft.body || variant?.contentId !== target.id
      || !item?.sourceRefs?.some(ref => ref.type === "journal" && ref.journal_id === note.id
        && ref.revision === payload.expectedRevision && ref.excerpt === draft.body))
      throw new Error("idea-read-unverified");
    return { id: note.id, contentId: item.id, variantId: variant.id };
  } catch {
    throw Object.assign(new Error("원문 메모는 저장됐지만 소재 연결은 확인하지 못했습니다. 입력을 유지했으니 다시 보내면 같은 소재를 확인합니다."), { id: note.id });
  }
}
