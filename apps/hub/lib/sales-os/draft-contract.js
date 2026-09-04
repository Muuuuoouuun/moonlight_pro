// Hub↔Engine draft contract — the crons' half.
//
// followup-autopilot and content-flywheel each POST a DRAFT mode to the Engine and turn the
// answer into a work_orders proposal. These predicates are the exact gate they apply before
// persisting anything. They live here, pure and @/-free, so draft-contract.test.mjs can assert
// them against the Engine's REAL response builder (apps/engine/lib/ai-draft-modes.ts) instead
// of a hand-copied fixture.
//
// This contract already drifted once, silently and expensively: both crons shipped calling
// Engine modes that did not exist, the Engine's normalizeMode quietly substituted an advisory
// mode, and the prose it returned could never satisfy these predicates. Every scheduled run
// since then produced zero work orders. Keep the test green and that cannot recur.

// Mode names the crons send. The Engine advertises the same strings on GET as `draftModes`,
// and the shared test asserts the two lists agree.
export const FOLLOWUP_DRAFT_MODE = "followup-draft";
export const CONTENT_DRAFT_MODE = "content-draft";

function isHttpSuccess(status) {
  return typeof status === "number" && status >= 200 && status < 300;
}

function isGenerated(data) {
  return Boolean(data) && typeof data === "object" && data.status === "generated";
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Guru followup-draft → { subject, body }. Both must be present and non-empty: `subject`
// becomes work_orders.title and `body` is the message the operator approves and sends.
export function isFollowupDraftOk(status, data) {
  return isHttpSuccess(status) && isGenerated(data) && hasText(data.subject) && hasText(data.body);
}

// Council content-draft → { title, body }. `title` becomes work_orders.title, `body` is the
// publishable draft.
export function isContentDraftOk(status, data) {
  return isHttpSuccess(status) && isGenerated(data) && hasText(data.title) && hasText(data.body);
}
