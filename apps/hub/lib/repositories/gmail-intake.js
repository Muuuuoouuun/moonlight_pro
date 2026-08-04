// Gmail scan -> lead_intake_raw staging pipeline.
//
// Mirrors the business-card pipeline (card-intake-core.js -> card-intake.js)
// and the Sheets import pipeline (sheets-normalize.js -> sheets-sync.js):
// classify (pure) -> build a staging record -> insert, tolerating the unique
// (workspace_id, source, source_ref) index as a "skipped" duplicate rather
// than an error. Unlike cards, nothing is auto-promoted here — email
// extraction is lower-confidence than a business-card photo, so every lead
// candidate lands as `status: 'pending'` for a human to review in the Intake
// Inbox (apps/hub/components/hub/pages/intake-inbox.jsx).

import { randomUUID } from "crypto";

import {
  insertSupabaseRecord,
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
} from "@/lib/server-write";
import {
  fetchRecentGmailMessages,
  fetchGoogleUserEmail,
  getValidGmailAccessToken,
  resolveGmailConnection,
} from "@/lib/google-gmail";
import { classifyEmailForLead } from "@/lib/email-lead-classifier";
import { computeMatchKey } from "@/lib/sheets-normalize";
import { assertOperatorEmail } from "@/lib/sales-os/operator-scope";

const STAGING_TABLE = "lead_intake_raw";

function emptyByDisposition() {
  return { lead: 0, support: 0, personal: 0, ignore: 0 };
}

function previewResult(reason, byDisposition) {
  return {
    status: "preview",
    reason,
    scanned: 0,
    staged: 0,
    skipped: 0,
    byDisposition,
  };
}

function buildIntakeRecord({ workspaceId, message, classification }) {
  const { reason, normalized } = classification;
  const matchKey = normalized ? computeMatchKey(normalized) : null;
  const id = randomUUID();

  return {
    id,
    workspace_id: workspaceId || null,
    source: "gmail",
    source_ref: `gmail:${message.id}`,
    raw: {
      from: message.from,
      subject: message.subject,
      snippet: message.snippet,
      messageId: message.id,
    },
    normalized: normalized ? { ...normalized, match_key: matchKey } : {},
    match_key: matchKey,
    status: "pending",
    note: reason,
    created_at: new Date().toISOString(),
  };
}

/**
 * Scan the connected Gmail inbox for lead-looking messages.
 *
 * By default (`dryRun: false`) lead-disposition messages are staged into
 * `lead_intake_raw` (status `pending`, never auto-promoted — the operator
 * reviews/promotes via the Intake Inbox). With `dryRun: true` messages are
 * only classified and counted — nothing is written; used by the GET route
 * for a cheap "what would this do" summary.
 *
 * Never fakes data: if there is no Supabase config, no workspace, no Gmail
 * connection, or the access token can't be refreshed, returns
 * `{ status: 'preview', reason }` untouched.
 *
 * @param {{ workspaceId?: string, maxMessages?: number, dryRun?: boolean }} options
 */
export async function scanGmailForLeads({
  workspaceId = resolveDefaultWorkspaceId(),
  maxMessages = 20,
  dryRun = false,
} = {}) {
  const byDisposition = emptyByDisposition();

  if (!dryRun && (!resolveSupabaseConfig() || !workspaceId)) {
    return previewResult("missing-supabase-config-or-workspace", byDisposition);
  }

  const connection = await resolveGmailConnection(workspaceId);
  if (!connection) {
    return previewResult("gmail-not-connected", byDisposition);
  }

  const accessToken = await getValidGmailAccessToken(connection);
  if (!accessToken) {
    return previewResult("gmail-auth-failed", byDisposition);
  }

  const email = connection?.config?.email || await fetchGoogleUserEmail(accessToken);
  const scopeCheck = assertOperatorEmail(email, "google_gmail");
  if (!scopeCheck.ok) {
    return {
      ...previewResult(scopeCheck.reason, byDisposition),
      detail: scopeCheck.actual
        ? `actual=${scopeCheck.actual} expected=${scopeCheck.expected}`
        : `expected=${scopeCheck.expected}`,
    };
  }

  let messages;
  try {
    messages = await fetchRecentGmailMessages({ accessToken, maxMessages });
  } catch (error) {
    return {
      ...previewResult("gmail-fetch-failed", byDisposition),
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let staged = 0;
  let skipped = 0;

  for (const message of messages) {
    const classification = classifyEmailForLead({
      from: message.from,
      subject: message.subject,
      snippet: message.snippet,
    });
    byDisposition[classification.disposition] =
      (byDisposition[classification.disposition] || 0) + 1;

    if (dryRun || classification.disposition !== "lead") {
      continue;
    }

    const record = buildIntakeRecord({ workspaceId, message, classification });
    // The unique (workspace_id, source, source_ref) index turns a re-scan of the
    // same message into reason "duplicate"; that and transient write failures
    // both surface as "skipped" — the scan itself still succeeded.
    const result = await insertSupabaseRecord(STAGING_TABLE, record);
    if (result.persisted) {
      staged += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    status: "ok",
    scanned: messages.length,
    staged,
    skipped,
    byDisposition,
  };
}
