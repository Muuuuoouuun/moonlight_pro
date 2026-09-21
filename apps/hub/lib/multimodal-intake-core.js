// Gemini multimodal: photo/audio/text -> structured fields. Raw fetch, no SDK.
// Matches the hub lib/google-vision pattern (x-goog-api-key header).

const BASE = (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export const MULTIMODAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    transcription: { type: "STRING" },
    actionItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          task: { type: "STRING" },
          suggestedDue: { type: "STRING" },
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["task", "priority"],
      },
    },
    keyDecisions: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    suggestedTags: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    detectedEntities: {
      type: "OBJECT",
      properties: {
        projects: { type: "ARRAY", items: { type: "STRING" } },
        peopleOrCompanies: { type: "ARRAY", items: { type: "STRING" } },
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
5. [actionItems]: 운영자가 즉시 실행해야 할 후속 조치나 할 일을 구체적인 작업 단위로 분리합니다. 기한이 언급되었다면 ISO 날짜(YYYY-MM-DD) 또는 구체적 시점을 suggestedDue에 넣습니다.
6. [keyDecisions]: 확정된 결정 사항, 합의 사항을 정리합니다.
7. [suggestedTags]: 메모 검색과 분류에 유용한 태그들을 해시태그 기호 없이 한글 단어로 추출합니다.
8. [detectedEntities]: 언급된 프로젝트명, 인물, 회사명을 분리 추출합니다.`;

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
export async function extractMultimodalIntakeHub({
  mediaBase64,
  mimeType = "image/jpeg",
  text = "",
  instruction = "",
  fetchImpl = fetch,
} = {}) {
  const { configured, apiKey, model, base } = getMultimodalStatus();
  if (!configured) {
    return { ok: false, error: "GEMINI_API_KEY not configured", data: null };
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

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: MULTIMODAL_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  let response;
  let raw;
  try {
    response = await fetchImpl(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body: JSON.stringify(body),
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
  if (!response.ok) {
    return {
      ok: false,
      error: parsedResponse?.error?.message || `Gemini HTTP ${response.status}`,
      data: null,
    };
  }

  const generatedText = extractText(parsedResponse);
  if (!generatedText) {
    return { ok: false, error: "Gemini 응답에 내용이 없습니다.", data: null };
  }

  const structured = safeJson(generatedText);
  if (!structured || typeof structured !== "object") {
    return { ok: false, error: "구조화된 JSON 파싱 실패", data: null };
  }

  return {
    ok: true,
    data: {
      title: structured.title || "무제 인테이크",
      summary: structured.summary || "",
      transcription: structured.transcription || "",
      actionItems: Array.isArray(structured.actionItems) ? structured.actionItems : [],
      keyDecisions: Array.isArray(structured.keyDecisions) ? structured.keyDecisions : [],
      suggestedTags: Array.isArray(structured.suggestedTags) ? structured.suggestedTags : [],
      detectedEntities: {
        projects: Array.isArray(structured.detectedEntities?.projects)
          ? structured.detectedEntities.projects
          : [],
        peopleOrCompanies: Array.isArray(structured.detectedEntities?.peopleOrCompanies)
          ? structured.detectedEntities.peopleOrCompanies
          : [],
      },
    },
  };
}
