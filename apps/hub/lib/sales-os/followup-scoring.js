// Follow-up scoring — pure, IO-free. Closes the outcome -> triage learning loop:
// yesterday's outreach result changes today's call list. Kept @/-free so it unit-tests
// standalone (mirrors sheets-normalize). Legible, additive signals on purpose — no opaque ML.

// outreach action -> momentum. Positive engagement pulls a lead UP the list (strike while warm);
// no_response / lost push it DOWN. won is terminal (leaves the active funnel anyway).
export const ACTION_MOMENTUM = {
  meeting: 30,
  proposal: 28,
  replied: 18,
  won: 0,
  sent: -4,
  no_response: -16,
  lost: -40,
};

// Recency-decayed boost added to triage priority. Full weight today, ~half at 7d, ~0 by 21d.
// ageDays null (unknown date) -> half weight. Pure: callers pass the already-computed ageDays.
export function outcomeBoost({ action = null, ageDays = null } = {}) {
  if (!action) return 0;
  const base = ACTION_MOMENTUM[String(action).toLowerCase()] ?? 0;
  if (base === 0) return 0;
  const decay = ageDays == null ? 0.5 : Math.max(0, 1 - ageDays / 21);
  return Math.round(base * decay * 10) / 10;
}

// Centralized priority: staleness (primary) + value + learned outcome boost.
export function priorityFor({ sinceDays = null, threshold = 3, valueTerm = 0, boost = 0 } = {}) {
  const staleTerm = (sinceDays == null ? threshold : sinceDays) * 10;
  return Math.round((staleTerm + valueTerm + boost) * 100) / 100;
}

// Derived 0-100 lead score from outreach history — the periodic leads.score recompute input.
// Starts neutral (40), recent last action moves it, repeated engagement compounds.
export function momentumScore({ lastAction = null, ageDays = null, replies = 0, meetings = 0, noResponses = 0 } = {}) {
  let s = 40;
  if (lastAction) {
    const base = ACTION_MOMENTUM[String(lastAction).toLowerCase()] ?? 0;
    const decay = ageDays == null ? 0.5 : Math.max(0, 1 - ageDays / 21);
    s += base * decay;
  }
  s += meetings * 12 + replies * 6 - noResponses * 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}
