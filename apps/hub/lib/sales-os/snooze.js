// Pure snooze check for the follow-up engine. A lead/deal is "snoozed" — suppressed from
// the follow-up queue — when its meta.snooze_until is a valid date in the future. Kept in a
// standalone module with no `@/` imports so it stays node --test-able and reusable.

export function isSnoozed(meta, now = Date.now()) {
  const raw = meta?.snooze_until;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return t > now;
}
