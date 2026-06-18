import { randomUUID } from "crypto";

import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { buildCardIntake } from "@/lib/card-intake-core";

// Build a lead_intake_raw row from extracted business-card fields.
// disposition drives status: promote -> pending (then promoted by the caller),
// review -> review (held for a look), rejected -> ignored (can't identify).
export function buildCardIntakeRecord(extracted = {}, { imageRef = null } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const { normalized, matchKey, disposition } = buildCardIntake(extracted);
  const now = new Date().toISOString();

  const status = disposition === "promote"
    ? "pending"
    : disposition === "review"
    ? "review"
    : "ignored";

  const cardId = randomUUID();
  const record = {
    id: cardId,
    workspace_id: workspaceId || null,
    source: "business_card",
    source_ref: `card:${cardId}`,
    raw: { extracted, image_ref: imageRef },
    normalized,
    match_key: matchKey,
    status,
    note: disposition === "rejected" ? "식별 불가 (이름·전화 없음)" : null,
    created_at: now,
  };

  return { workspaceId, record, disposition, matchKey, normalized };
}
