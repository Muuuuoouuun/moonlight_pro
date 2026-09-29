// Shared `select` for single-row `workspaces` reads (id filter, limit 1).
//
// Several repositories each read the same workspace row for a different field
// (timezone, contact-tracking cutover, revenue targets, deadline-alert reset)
// but used to ask for a different `select` per call site. That made every one
// of those reads a distinct PostgREST URL, so even when they land inside the
// same request (e.g. daily-brief fans out to getWorkLedger + getRevenueLedger
// + getDeadlineAlertSettings) each call paid for its own network round trip.
//
// packages/supabase-rest/index.js's dedupedRead() only coalesces concurrent
// GETs whose request key (URL + apiKey + timeout + mode) matches exactly — so
// every workspaces read in a single request must ask for the *same* select
// (and the same filters/limit) to collapse into one network call. This
// constant is that shared shape; each call site's mapping code only reads its
// own field out of the wider row.
export const WORKSPACE_ROW_SELECT = "id,meta,timezone,updated_at";
