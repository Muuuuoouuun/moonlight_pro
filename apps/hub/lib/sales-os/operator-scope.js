export const DEFAULT_OPERATOR_EMAIL = "junhyuk.mun@classin.com";
export const DEFAULT_OPERATOR_ALIAS = "junhyuk";
export const DEFAULT_EEOCRM_OWNER_ID = "3935704427463307";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return clean(value).toLowerCase();
}

export function resolveOperatorEmail() {
  return lower(process.env.COM_MOON_OPERATOR_EMAIL) || DEFAULT_OPERATOR_EMAIL;
}

export function resolveOperatorAlias() {
  return lower(process.env.COM_MOON_OPERATOR_ALIAS) || DEFAULT_OPERATOR_ALIAS;
}

export function resolveEeocrmOwnerId() {
  return clean(process.env.EEOCRM_OWNER_ID) || DEFAULT_EEOCRM_OWNER_ID;
}

export function resolvePersonalLeadsSpreadsheetId() {
  return (
    clean(process.env.COM_MOON_PERSONAL_LEADS_SPREADSHEET_ID) ||
    clean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID)
  );
}

export function assertOperatorEmail(email, source = "google") {
  const expected = resolveOperatorEmail();
  const actual = lower(email);

  if (!actual) {
    return { ok: false, reason: "missing-operator-email", source, expected };
  }

  if (actual !== expected) {
    return { ok: false, reason: "operator-email-mismatch", source, expected, actual };
  }

  return { ok: true, source, email: actual };
}

export function assertPersonalLeadsSpreadsheetId(spreadsheetId) {
  const expected = resolvePersonalLeadsSpreadsheetId();
  const actual = clean(spreadsheetId);

  if (!expected) {
    return { ok: false, reason: "missing-personal-leads-spreadsheet-id" };
  }

  if (!actual) {
    return { ok: false, reason: "missing-spreadsheet-id", expected };
  }

  if (actual !== expected) {
    return { ok: false, reason: "personal-leads-spreadsheet-mismatch", expected, actual };
  }

  return { ok: true, spreadsheetId: actual };
}

export function assertEeocrmOwnerId(ownerId) {
  const expected = resolveEeocrmOwnerId();
  const actual = clean(ownerId);

  if (!actual) {
    return { ok: false, reason: "missing-eeocrm-owner-id", expected };
  }

  if (actual !== expected) {
    return { ok: false, reason: "eeocrm-owner-mismatch", expected, actual };
  }

  return { ok: true, ownerId: actual };
}
