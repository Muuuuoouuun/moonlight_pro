import type { SupabaseDetailedReadResult, SupabaseFilter, SupabaseQueryOptions } from "@com-moon/supabase-rest";

export interface KnowledgeItem {
  id: string;
  sourceTable: "journal_entries" | "contact_outcomes" | "journal_patterns";
  kind: string;
  title: string;
  snippet: string;
  occurredAt?: string;
  score: number;
  matchedKeywords: string[];
  contextType?: string;
  contextId?: string;
}

export interface RetrievalFilters {
  kinds?: string[]; // e.g. ["note", "daily_review", "call", "meeting", "pattern"]
  dateFrom?: string;
  dateTo?: string;
  contextType?: "project" | "lead" | "account" | "brand";
  contextId?: string;
  limit?: number;
}

export interface RetrievalInput {
  workspaceId: string;
  query: string;
  filters?: RetrievalFilters;
}

export interface RetrievalResult {
  status: "live" | "preview" | "error";
  workspaceId: string;
  query: string;
  totalCandidatesScored: number;
  items: KnowledgeItem[];
  error?: string;
}

const STOP_WORDS = new Set(["은", "는", "이", "가", "을", "를", "에", "의", "로", "과", "와", "도", "으로", "에서", "the", "a", "an", "is", "in", "to", "for", "of"]);
const PARTICLES = ["에서는", "에서", "으로", "에는", "과", "와", "은", "는", "이", "가", "을", "를", "에", "의", "로", "도"];

/**
 * Extracts non-trivial search keywords from a query, stripping Korean particles where appropriate.
 */
export function extractKeywords(query: string): string[] {
  if (!query || typeof query !== "string") return [];
  const rawTokens = query
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const result: string[] = [];
  for (const token of rawTokens) {
    let cleaned = token;
    for (const p of PARTICLES) {
      if (cleaned.length > p.length + 1 && cleaned.endsWith(p)) {
        cleaned = cleaned.slice(0, -p.length);
        break;
      }
    }
    if (cleaned.length >= 2 && !STOP_WORDS.has(cleaned)) {
      result.push(cleaned);
      // Also keep original if different
      if (cleaned !== token) {
        result.push(token);
      }
    } else if (token.length >= 2) {
      result.push(token);
    }
  }

  return [...new Set(result)];
}

/**
 * Generates an attributed snippet centered around the best keyword match.
 */
export function extractAttributedSnippet(text: string, keywords: string[], maxLength = 160): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  let bestIdx = -1;

  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }

  if (bestIdx === -1) {
    return text.slice(0, maxLength).trim() + (text.length > maxLength ? "…" : "");
  }

  const start = Math.max(0, bestIdx - 40);
  const end = Math.min(text.length, start + maxLength);
  let snippet = text.slice(start, end).trim();

  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

/**
 * Calculates a relevance score for a record given search keywords and optional full query phrase.
 */
export function scoreRelevance(
  record: { title?: string; body?: string; occurredAt?: string },
  query: string,
  keywords: string[]
): { score: number; matchedKeywords: string[] } {
  let score = 0;
  const matchedKeywords: string[] = [];
  const text = `${record.title || ""} ${record.body || ""}`.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();

  // 1. Exact phrase match boost
  if (lowerQuery.length >= 3 && text.includes(lowerQuery)) {
    score += 10.0;
  }

  // 2. Keyword matches
  for (const kw of keywords) {
    if (text.includes(kw)) {
      score += 2.5;
      matchedKeywords.push(kw);
    }
  }

  // Title match extra weight
  const lowerTitle = (record.title || "").toLowerCase();
  for (const kw of keywords) {
    if (lowerTitle.includes(kw)) {
      score += 3.0;
    }
  }

  // 3. Recency decay boost
  if (record.occurredAt && score > 0) {
    const date = Date.parse(record.occurredAt);
    if (Number.isFinite(date)) {
      const ageMs = Math.max(0, Date.now() - date);
      const days = ageMs / (1000 * 60 * 60 * 24);
      if (days <= 7) score += 1.5;
      else if (days <= 30) score += 0.8;
    }
  }

  return { score, matchedKeywords };
}

/**
 * Core Knowledge Retrieval function (Hybrid RAG).
 */
export async function retrieveKnowledge(
  input: RetrievalInput,
  deps: {
    readTable: (table: string, options: SupabaseQueryOptions) => Promise<SupabaseDetailedReadResult<Record<string, any>>>;
  }
): Promise<RetrievalResult> {
  const { workspaceId, query, filters = {} } = input;
  const limit = Math.min(Math.max(1, filters.limit || 5), 20);

  if (!workspaceId) {
    return {
      status: "error",
      workspaceId: "",
      query: query || "",
      totalCandidatesScored: 0,
      items: [],
      error: "missing-workspace-id",
    };
  }

  const keywords = extractKeywords(query);
  const candidates: KnowledgeItem[] = [];
  let totalCandidatesScored = 0;

  try {
    // 1. Fetch from journal_entries (Notes & Daily Reviews)
    const journalFilters: SupabaseFilter[] = [
      ["workspace_id", `eq.${workspaceId}`],
    ];
    if (filters.dateFrom) journalFilters.push(["occurred_at", `gte.${filters.dateFrom}`]);
    if (filters.dateTo) journalFilters.push(["occurred_at", `lt.${filters.dateTo}`]);

    const journalRes = await deps.readTable("journal_entries", {
      select: "id,workspace_id,title,body,occurred_at,entry_kind,note_meta",
      filters: journalFilters,
      order: "occurred_at.desc",
      limit: 60,
    });

    const journalRows = Array.isArray(journalRes.rows) ? journalRes.rows : (Array.isArray((journalRes as any).data) ? (journalRes as any).data : []);
    for (const row of journalRows) {
      totalCandidatesScored++;
      const fullBody = `${row.body || ""} ${row.note_meta?.enhancement || ""}`;
      const { score, matchedKeywords } = scoreRelevance(
        { title: row.title, body: fullBody, occurredAt: row.occurred_at },
        query,
        keywords
      );

      if (score > 0 || !query.trim()) {
        candidates.push({
          id: row.id,
          sourceTable: "journal_entries",
          kind: row.entry_kind || "note",
          title: row.title || "(제목 없는 메모)",
          snippet: extractAttributedSnippet(fullBody, keywords),
          occurredAt: row.occurred_at,
          score,
          matchedKeywords,
        });
      }
    }

    // 2. Fetch from contact_outcomes (CRM Customer Meetings / Calls)
    const outcomeFilters: SupabaseFilter[] = [
      ["workspace_id", `eq.${workspaceId}`],
    ];
    if (filters.dateFrom) outcomeFilters.push(["created_at", `gte.${filters.dateFrom}`]);
    if (filters.dateTo) outcomeFilters.push(["created_at", `lt.${filters.dateTo}`]);

    const outcomeRes = await deps.readTable("contact_outcomes", {
      select: "id,workspace_id,kind,summary,reaction,next_action,created_at",
      filters: outcomeFilters,
      order: "created_at.desc",
      limit: 40,
    });

    const outcomeRows = Array.isArray(outcomeRes.rows) ? outcomeRes.rows : (Array.isArray((outcomeRes as any).data) ? (outcomeRes as any).data : []);
    for (const row of outcomeRows) {
      totalCandidatesScored++;
      const fullText = `${row.summary || ""} 반응: ${row.reaction || ""} 다음행동: ${row.next_action || ""}`;
      const { score, matchedKeywords } = scoreRelevance(
        { title: `고객 ${row.kind || "상담"} 기록`, body: fullText, occurredAt: row.created_at },
        query,
        keywords
      );

      if (score > 0 || !query.trim()) {
        candidates.push({
          id: row.id,
          sourceTable: "contact_outcomes",
          kind: row.kind || "meeting",
          title: `고객 ${row.kind || "상담"} (${row.reaction || "진행"})`,
          snippet: extractAttributedSnippet(fullText, keywords),
          occurredAt: row.created_at,
          score,
          matchedKeywords,
        });
      }
    }

    // Sort by score desc, then recency desc
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dateA = a.occurredAt ? Date.parse(a.occurredAt) : 0;
      const dateB = b.occurredAt ? Date.parse(b.occurredAt) : 0;
      return dateB - dateA;
    });

    return {
      status: "live",
      workspaceId,
      query,
      totalCandidatesScored,
      items: candidates.slice(0, limit),
    };
  } catch (err: any) {
    return {
      status: "error",
      workspaceId,
      query,
      totalCandidatesScored,
      items: [],
      error: err.message || "retrieval-failed",
    };
  }
}
