// Gemini multimodal: photo/audio/text -> structured fields. Raw fetch, no SDK.
// Matches the hub lib/google-vision pattern (x-goog-api-key header).

const BASE = (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export const MAX_MULTIMODAL_MEDIA_BYTES = 14 * 1024 * 1024;
// 14 MiB becomes 19,573,420 base64 bytes, leaving room for JSON and prompts
// within Gemini's 20 MB inline request limit.
export const MAX_MULTIMODAL_REQUEST_BYTES = 20_000_000;
const MEDIA_MIME = /^(?:image\/(?:png|jpeg|webp|heic|heif)|audio\/(?:wav|mp3|mpeg|aiff|aac|ogg|flac|m4a|l16|opus|alaw|mulaw|webm))$/;
const MIME_ALIASES = { "audio/mp4": "audio/m4a", "audio/x-m4a": "audio/m4a", "audio/x-wav": "audio/wav", "audio/x-aiff": "audio/aiff", "audio/x-flac": "audio/flac" };
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isText = (value, max) => typeof value === "string" && value.length <= max && !value.includes("\0");
const isStringArray = (value, count, length) => Array.isArray(value) && value.length <= count && value.every((item) => isText(item, length));

function isDueDate(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateInput(input) {
  const invalid = (error, status = 400) => ({ ok: false, status, error, data: null });
  if (!isObject(input)) return invalid("JSON 객체가 필요합니다.");
  for (const [key, limit] of [["text", 20000], ["instruction", 2000]]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].length > limit)) {
      return invalid(`${key}는 ${limit}자 이하의 문자열이어야 합니다.`);
    }
  }
  const { mediaBase64, mimeType } = input;
  if (mediaBase64 !== undefined) {
    if (typeof mediaBase64 !== "string" || !mediaBase64 || typeof mimeType !== "string" || !MEDIA_MIME.test(MIME_ALIASES[mimeType] || mimeType)) {
      return invalid("지원되는 사진 또는 오디오 MIME 유형과 base64 데이터가 필요합니다.");
    }
    if (mediaBase64.length > Math.ceil(MAX_MULTIMODAL_MEDIA_BYTES / 3) * 4) return invalid("사진 및 오디오 파일은 14MB 이하로 업로드할 수 있습니다.", 413);
    if (mediaBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(mediaBase64)) return invalid("올바른 base64 미디어 데이터가 필요합니다.");
    const bytes = mediaBase64.length / 4 * 3 - (mediaBase64.endsWith("==") ? 2 : mediaBase64.endsWith("=") ? 1 : 0);
    if (bytes > MAX_MULTIMODAL_MEDIA_BYTES) return invalid("사진 및 오디오 파일은 14MB 이하로 업로드할 수 있습니다.", 413);
  } else if (mimeType !== undefined) {
    return invalid("mimeType에는 미디어 데이터가 함께 필요합니다.");
  }
  if (!mediaBase64 && !input.text?.trim()) return invalid("mediaBase64 또는 text 중 최소 하나가 필요합니다.");
  return null;
}

function isIntakeResult(value) {
  if (!(isObject(value) && isText(value.title, 200) && isText(value.summary, 20000) && isText(value.transcription, 20000)
    && (value.meetingMinutes === undefined || isText(value.meetingMinutes, 20000))
    && Array.isArray(value.actionItems) && value.actionItems.length <= 20
    && value.actionItems.every((item) => isObject(item) && isText(item.task, 300) && item.task.trim()
      && ["high", "medium", "low"].includes(item.priority)
      && isDueDate(item.suggestedDue))
    && isStringArray(value.keyDecisions, 20, 1000)
    && (value.openIssues === undefined || isStringArray(value.openIssues, 20, 1000))
    && isStringArray(value.suggestedTags, 8, 256)
    && value.suggestedTags.every((tag) => [...tag.normalize("NFC")].length <= 32 && !/[,，\n]/.test(tag))
    && isObject(value.detectedEntities) && isStringArray(value.detectedEntities.projects, 20, 200)
    && isStringArray(value.detectedEntities.peopleOrCompanies, 20, 200))) return false;
  const parts = [];
  if (value.summary) parts.push(`[핵심 요약]\n${value.summary}`);
  if (value.meetingMinutes) parts.push(`[회의/논의 흐름]\n${value.meetingMinutes}`);
  if (value.transcription) parts.push(`[전사/원문 내용]\n${value.transcription}`);
  if (value.keyDecisions?.length) parts.push(`[결정사항]\n${value.keyDecisions.map((item) => `- ${item}`).join("\n")}`);
  if (value.openIssues?.length) parts.push(`[미결/보류 안건]\n${value.openIssues.map((item) => `- ${item}`).join("\n")}`);
  return parts.join("\n\n").length <= 20000;
}

export const MULTIMODAL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "200자 이하의 제목" },
    summary: { type: "string" },
    transcription: { type: "string" },
    meetingMinutes: { type: "string", description: "안건별 논의 흐름이나 화자별 주요 발언 요점. 단일 메모면 빈 문자열." },
    actionItems: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          task: { type: "string", description: "1~300자의 구체적인 할 일" },
          suggestedDue: { type: ["string", "null"], format: "date", description: "실제 YYYY-MM-DD 날짜. 확정할 수 없으면 null." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["task", "priority"],
      },
    },
    keyDecisions: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    openIssues: {
      type: "array",
      maxItems: 20,
      items: { type: "string", description: "결론나지 않은 미결/보류/후속 검토 안건" },
    },
    suggestedTags: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    detectedEntities: {
      type: "object",
      properties: {
        projects: { type: "array", maxItems: 20, items: { type: "string" } },
        peopleOrCompanies: { type: "array", maxItems: 20, items: { type: "string" } },
      },
      required: ["projects", "peopleOrCompanies"],
    },
  },
  required: [
    "title",
    "summary",
    "transcription",
    "actionItems",
    "keyDecisions",
    "suggestedTags",
    "detectedEntities",
  ],
};

const SYSTEM_INSTRUCTION = `당신은 1인 운영자의 개인 운영체제(Moonlight) 인텔리전트 인테이크 어시스턴트입니다.
업로드된 사진(화이트보드, 손글씨 메모, 문서, 스크린샷), 오디오(음성 녹음, 회의, 통화, 생각 메모), 또는 원시 텍스트를 분석하여 운영자의 인지적 부하를 최소화할 수 있도록 완벽히 구조화합니다.

원칙:
1. 없는 사실을 지어내지 마십시오(Zero Hallucination). 불분명한 내용은 임의로 단정하지 않습니다.
2. [title]: 50자 이내의 명확한 한글 제목을 부여합니다.
3. [summary]: 핵심 내용을 1~3문장의 명확한 개조식 또는 평서문으로 요약합니다.
4. [transcription]: 이미지에서 읽어낸 모든 텍스트 원문이나, 오디오에서 발화된 상세 전사 내용을 충실히 기록합니다.
5. [meetingMinutes]: 회의나 대화인 경우 안건별 논의 흐름과 화자별 핵심 발언 요지를 충실히 기록합니다.
6. [actionItems]: 운영자가 실행해야 할 후속 조치를 최대 20개, 각 300자 이내로 분리합니다. suggestedDue에는 원문에서 확정할 수 있는 실제 날짜(YYYY-MM-DD)만 넣습니다. 상대 날짜의 기준이 불분명하면 null로 두고 해당 표현은 원문 전사에 보존합니다.
7. [keyDecisions]: 확정된 합의/결정 사항을 정리합니다.
8. [openIssues]: 결정되지 않고 후속 논의나 확인이 필요한 미결/보류 안건을 분리합니다.
9. [suggestedTags]: 해시태그·쉼표·줄바꿈 없이 32자 이내의 태그를 최대 8개 추출합니다.
10. [detectedEntities]: 언급된 프로젝트명, 인물, 회사명을 분리 추출합니다.
11. 요약·전사·결정사항을 합친 메모는 구분 제목을 포함하여 20,000자 이하여야 합니다. 원문을 임의로 잘라내지 마십시오.`;

export function formatMeetingBriefForShare(data) {
  if (!isObject(data)) return "";
  const lines = [];
  if (data.title) lines.push(`📌 [회의/메모] ${data.title}`);
  if (data.summary) lines.push(`\n■ 핵심 요약\n${data.summary}`);
  if (data.keyDecisions?.length) lines.push(`\n■ 합의 및 결정사항\n${data.keyDecisions.map((d) => `• ${d}`).join("\n")}`);
  if (data.openIssues?.length) lines.push(`\n■ 미결/후속 논의 안건\n${data.openIssues.map((i) => `• ${i}`).join("\n")}`);
  if (data.actionItems?.length) {
    lines.push(`\n■ 후속 실행 과제 (Action Items)\n${data.actionItems.map((a) => `□ ${a.task}${a.suggestedDue ? ` (기한: ${a.suggestedDue})` : ""}`).join("\n")}`);
  }
  if (data.detectedEntities?.peopleOrCompanies?.length) {
    lines.push(`\n■ 관련자: ${data.detectedEntities.peopleOrCompanies.join(", ")}`);
  }
  return lines.join("\n").trim();
}

export function getMultimodalStatus() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  return { configured: Boolean(apiKey), apiKey, model: MODEL, base: BASE };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
}

/**
 * Extracts structured intelligence from base64 media (image/audio) or raw text.
 * @param {{
 *   mediaBase64?: string,
 *   mimeType?: string,
 *   text?: string,
 *   instruction?: string,
 *   fetchImpl?: typeof fetch
 * }} options
 */
export async function extractMultimodalIntakeHub(input = {}) {
  const invalid = validateInput(input);
  if (invalid) return invalid;
  const { mediaBase64, text = "", instruction = "", fetchImpl = fetch } = input;
  const mimeType = MIME_ALIASES[input.mimeType] || input.mimeType;
  const { configured, apiKey, model, base } = getMultimodalStatus();
  if (!configured) {
    return { ok: false, reason: "gemini-not-configured", error: "GEMINI_API_KEY not configured", data: null };
  }

  const hasMedia = Boolean(mediaBase64);
  const hasText = Boolean(text?.trim());

  if (!hasMedia && !hasText) {
    return { ok: false, error: "mediaBase64 또는 text 중 최소 하나가 필요합니다.", data: null };
  }

  const promptText = [
    hasMedia ? `첨부 미디어 타입: ${mimeType}` : "텍스트 입력",
    instruction ? `추가 지침: ${instruction}` : "",
    hasText ? `원문 텍스트:\n${text}` : "",
    "위 내용을 분석하여 정해진 JSON 스키마에 맞춰 결과를 반환하십시오.",
  ].filter(Boolean).join("\n\n");

  const parts = [{ text: promptText }];
  if (hasMedia) {
    parts.push({
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: mediaBase64,
      },
    });
  }

  const generationConfig = {
    responseMimeType: "application/json",
    responseJsonSchema: MULTIMODAL_SCHEMA,
    temperature: 0.1,
    maxOutputTokens: 8192,
    ...(Number.isFinite(input.thinkingBudget) ? { thinkingConfig: { thinkingBudget: input.thinkingBudget } } : {}),
  };

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  let response;
  let raw;
  try {
    response = await fetchImpl(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    raw = await response.text();
  } catch (error) {
    return {
      ok: false,
      error: `Gemini API 요청 실패: ${error instanceof Error ? error.message : String(error)}`,
      data: null,
    };
  }

  const parsedResponse = raw ? safeJson(raw) : null;
  // Token counts only, fire-and-forget: the usage log never delays or fails this answer.
  // Loaded lazily because a client page imports this file for formatMeetingBriefForShare;
  // the Supabase write client must not enter that bundle's static graph.
  const usageRecord = { surface: "hub-multimodal-intake", model, usageMetadata: parsedResponse?.usageMetadata };
  if (typeof input.recordUsage === "function") {
    try { input.recordUsage(usageRecord); } catch { /* never block the answer */ }
  } else {
    import("./ai-usage-log.js").then((module) => module.recordAiUsage(usageRecord)).catch(() => null);
  }
  if (!response.ok) {
    return {
      ok: false,
      error: typeof parsedResponse?.error?.message === "string" ? parsedResponse.error.message : `Gemini HTTP ${response.status}`,
      data: null,
    };
  }

  const generatedText = extractText(parsedResponse);
  if (!generatedText) {
    return { ok: false, error: "Gemini 응답에 내용이 없습니다.", data: null };
  }

  const structured = safeJson(generatedText);
  if (!isIntakeResult(structured)) {
    return { ok: false, error: "분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.", data: null };
  }

  const usageMetadata = parsedResponse?.usageMetadata;
  const usage = usageMetadata ? {
    promptTokens: usageMetadata.promptTokenCount || 0,
    candidatesTokens: usageMetadata.candidatesTokenCount || 0,
    totalTokens: usageMetadata.totalTokenCount || 0,
  } : null;

  return {
    ok: true,
    data: {
      title: structured.title || "무제 인테이크",
      summary: structured.summary,
      transcription: structured.transcription,
      ...(structured.meetingMinutes !== undefined ? { meetingMinutes: structured.meetingMinutes } : {}),
      actionItems: structured.actionItems,
      keyDecisions: structured.keyDecisions,
      ...(structured.openIssues !== undefined ? { openIssues: structured.openIssues } : {}),
      suggestedTags: structured.suggestedTags,
      detectedEntities: {
        projects: structured.detectedEntities.projects,
        peopleOrCompanies: structured.detectedEntities.peopleOrCompanies,
      },
    },
    ...(usage ? { usage } : {}),
  };
}
