// Inbox capture classifier — pure, IO-free (capture-spine.md §2 routing table).
//
// Turns one field-captured line ("대치수학 원장 통화, 가격 비싸다, 화요일 재방문") into a
// {kind, destination, channel} so the router can stage it. Heuristic + hint override; the local
// /team command can replace this with an LLM pass, but the hub stays deterministic and testable.
// Invariant: never drops — an unrecognized line classifies as `review` (needs_human), never lost.

// kind -> the existing table the capture ultimately lands in (capture-spine §2). null = review.
export const KIND_DESTINATION = {
  lead: "lead_intake_raw",
  dm: "lead_intake_raw",
  outcome: "outreach_outcomes",
  idea: "content_items",
  engagement: "content_items",
  note: "notes",
  review: null,
};

// Operator quick-tags (capture-spine §1): 리드/통화/방문/DM/아이디어/반응/메모.
const HINT_KIND = {
  "리드": "lead", lead: "lead",
  "통화": "outcome", "전화": "outcome", "방문": "outcome", "미팅": "outcome",
  dm: "dm", "디엠": "dm",
  "아이디어": "idea", "소재": "idea", "앵글": "idea",
  "반응": "engagement",
  "메모": "note", "기타": "note",
};

function detectChannel(text) {
  if (/(카톡|카카오|kakao)/i.test(text)) return "kakao";
  if (/(방문|만남|미팅)/.test(text)) return "visit";
  if (/(통화|전화|콜|call)/i.test(text)) return "phone";
  if (/(\bdm\b|디엠|인스타|스레드|메시지)/i.test(text)) return "dm";
  return null;
}

// Ordered keyword rules — first match wins. Outcome (call/visit) outranks lead so
// "대치수학 원장 통화" routes to an outcome, not a new lead.
const KEYWORD_RULES = [
  { kind: "engagement", re: /(반응|좋아요|저장|조회수?|노출|좋았|별로|망했|터졌)/ },
  { kind: "outcome", re: /(통화|전화|방문|미팅|만남|콜|다녀옴|다녀왔|약속|재방문)/ },
  { kind: "dm", re: /(\bdm\b|디엠|인스타\s?dm|스레드\s?dm|메시지\s?옴|디엠\s?옴)/i },
  { kind: "lead", re: /(명함|소개\s?받|소개로|신규\s?학원|신규\s?리드|문의\s?옴|문의\s?들어옴|상담\s?요청)/ },
  { kind: "idea", re: /(아이디어|소재|앵글|글감|떠올|영상\s?소재|콘텐츠\s?거리)/ },
  { kind: "note", re: /(메모|기타|참고|todo|할\s?일)/i },
];

function channelFor(kind, detected) {
  if (kind === "outcome") return detected || "phone";
  if (kind === "dm") return "dm";
  return detected;
}

export function classifyCapture(raw, hint = null) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const detected = detectChannel(text);

  // 1) explicit hint wins
  if (hint != null && String(hint).trim()) {
    const h = String(hint).trim();
    const kind = HINT_KIND[h] || HINT_KIND[h.toLowerCase()] || null;
    if (kind) {
      return { kind, destination: KIND_DESTINATION[kind], channel: channelFor(kind, detected), confidence: "high", reason: `hint:${h}` };
    }
  }

  // 2) keyword inference
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) {
      return { kind: rule.kind, destination: KIND_DESTINATION[rule.kind], channel: channelFor(rule.kind, detected), confidence: "med", reason: `keyword:${rule.kind}` };
    }
  }

  // 3) ambiguous — never dropped
  return { kind: "review", destination: null, channel: detected, confidence: "low", reason: "분류 불가 — needs_human" };
}
