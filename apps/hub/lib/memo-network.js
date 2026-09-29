const STOP_WORDS = new Set([
  "의", "를", "을", "에", "는", "은", "이", "가", "하고", "으로", "에서", "에게",
  "과", "와", "도", "로", "등", "및", "수", "것", "더", "때", "한", "그", "이것",
  "있습니다", "합니다", "입니다", "위해", "대한", "통해", "따라",
  "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "is", "are",
]);

const JOSA_REGEX = /(?:에서|에게|으로|까지|부터|하고|이나|보다|마다|처럼|은|는|이|가|을|를|의|에|와|과|도|로|만)$/;

function normalizeWord(word) {
  if (typeof word !== "string") return "";
  const cleaned = word.replace(JOSA_REGEX, "");
  return cleaned.length >= 2 ? cleaned : word;
}

function extractKeywords(text, max = 50) {
  if (typeof text !== "string") return [];
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => normalizeWord(w.trim()))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, max);
}

function getMemoTags(memo) {
  if (!memo) return [];
  const tags = [];
  if (Array.isArray(memo.note_meta?.tags)) {
    tags.push(...memo.note_meta.tags);
  }
  if (typeof memo.labels === "string") {
    tags.push(...memo.labels.split(/[,，\n]/).map((t) => t.trim()));
  }
  return Array.from(new Set(tags.filter(Boolean)));
}

function getMemoEntities(memo) {
  if (!memo) return [];
  const entities = [];
  const meta = memo.note_meta;
  if (Array.isArray(meta?.detectedEntities?.projects)) {
    entities.push(...meta.detectedEntities.projects);
  }
  if (Array.isArray(meta?.detectedEntities?.peopleOrCompanies)) {
    entities.push(...meta.detectedEntities.peopleOrCompanies);
  }
  return Array.from(new Set(entities.filter(Boolean)));
}

/**
 * Finds top related memos from a collection based on shared tags, entities, and keywords.
 * @param {object} currentMemo
 * @param {Array<object>} allMemos
 * @param {{ limit?: number, minScore?: number }} options
 */
export function findRelatedMemos(currentMemo, allMemos = [], { limit = 3, minScore = 1.2 } = {}) {
  if (!currentMemo || !Array.isArray(allMemos) || allMemos.length === 0) {
    return [];
  }

  const currentId = currentMemo.id;
  const currentTags = new Set(getMemoTags(currentMemo).map((t) => t.toLowerCase()));
  const currentEntities = new Set(getMemoEntities(currentMemo).map((e) => e.toLowerCase()));
  const currentTitleWords = new Set(extractKeywords(currentMemo.title));
  const currentBodyWords = new Set(extractKeywords(currentMemo.body, 100));

  const scored = [];

  for (const candidate of allMemos) {
    if (!candidate || candidate.id === currentId) continue;

    let score = 0;
    const reasons = [];

    // 1. Shared tags (+3.0 each)
    const candidateTags = getMemoTags(candidate);
    const sharedTags = candidateTags.filter((t) => currentTags.has(t.toLowerCase()));
    if (sharedTags.length > 0) {
      score += sharedTags.length * 3.0;
      reasons.push(`태그 [${sharedTags.slice(0, 2).join(", ")}] 일치`);
    }

    // 2. Shared entities (+3.0 each)
    const candidateEntities = getMemoEntities(candidate);
    const sharedEntities = candidateEntities.filter((e) => currentEntities.has(e.toLowerCase()));
    if (sharedEntities.length > 0) {
      score += sharedEntities.length * 3.0;
      reasons.push(`연관 객체 [${sharedEntities.slice(0, 2).join(", ")}] 연결`);
    }

    // 3. Title keyword overlap (+2.0 each)
    const candTitleWords = extractKeywords(candidate.title);
    const sharedTitleWords = candTitleWords.filter((w) => currentTitleWords.has(w));
    if (sharedTitleWords.length > 0) {
      score += sharedTitleWords.length * 2.0;
      reasons.push(`주제어 [${sharedTitleWords.slice(0, 2).join(", ")}] 연관`);
    }

    // 3b. Title keyword appears in current body (+1.0 each)
    const titleInBody = candTitleWords.filter((w) => !currentTitleWords.has(w) && currentBodyWords.has(w));
    if (titleInBody.length > 0) {
      score += Math.min(titleInBody.length * 1.0, 3.0);
      if (reasons.length < 2) {
        reasons.push(`문맥 [${titleInBody.slice(0, 2).join(", ")}] 연관`);
      }
    }

    // 4. Body keyword overlap (+0.4 each, capped at 4.0)
    const candBodyWords = extractKeywords(candidate.body, 100);
    const sharedBodyWords = candBodyWords.filter((w) => currentBodyWords.has(w));
    if (sharedBodyWords.length > 0) {
      const bodyScore = Math.min(sharedBodyWords.length * 0.4, 4.0);
      score += bodyScore;
      if (reasons.length === 0 && sharedBodyWords.length >= 2) {
        reasons.push(`문맥 [${sharedBodyWords.slice(0, 2).join(", ")}] 공통`);
      }
    }

    if (score >= minScore) {
      scored.push({
        id: candidate.id,
        title: candidate.title || "무제 메모",
        occurredAt: candidate.occurred_at || candidate.occurredAt || candidate.created_at,
        score: Math.round(score * 10) / 10,
        reasons,
        sharedTags,
        sharedEntities,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
