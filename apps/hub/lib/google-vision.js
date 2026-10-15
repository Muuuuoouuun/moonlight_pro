// Gemini vision: business-card image -> structured fields. Raw fetch, no SDK.
// Matches the engine's lib/gemini auth/parsing pattern (x-goog-api-key header).
import { recordAiUsage } from "./ai-usage-log.js";

function resolveBaseUrl() {
  return (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
}

function resolveModel() {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

const PROMPT = `이 명함 이미지에서 아래 필드를 추출해 JSON만 출력해. 불확실한 값은 추측하지 말고 null로 둬.
{"name": 사람 이름 또는 null, "company": 회사/학원/기관명 또는 null, "phone": 전화번호 또는 null, "email": 이메일 또는 null, "title": 직책 또는 null, "address": 주소 또는 null}`;

export function getVisionStatus() {
  const apiKey = (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
  return { configured: Boolean(apiKey), apiKey, model: resolveModel(), base: resolveBaseUrl() };
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
}

// imageBase64: base64 string (no data: prefix). Returns { ok, fields, error }.
export async function extractBusinessCard(imageBase64, mimeType = "image/jpeg") {
  const { configured, apiKey, model, base } = getVisionStatus();
  if (!configured) {
    return { ok: false, error: "GEMINI_API_KEY not configured", fields: null };
  }
  if (!imageBase64) {
    return { ok: false, error: "missing image data", fields: null };
  }

  let response;
  let raw;
  try {
    response = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 2048 },
      }),
    });
    raw = await response.text();
  } catch (error) {
    return { ok: false, error: `vision request failed: ${error instanceof Error ? error.message : String(error)}`, fields: null };
  }

  const data = raw ? safeJson(raw) : null;
  // Token counts only, fire-and-forget: the usage log never delays or fails this answer.
  recordAiUsage({ surface: "hub-business-card", model, usageMetadata: data?.usageMetadata });
  if (!response.ok) {
    return { ok: false, error: data?.error?.message || `vision HTTP ${response.status}`, fields: null };
  }

  const text = extractText(data);
  if (!text) {
    return { ok: false, error: "empty vision response", fields: null };
  }

  const fields = safeJson(text);
  if (!fields || typeof fields !== "object") {
    return { ok: false, error: "vision JSON parse failed", fields: null, rawText: text };
  }

  return { ok: true, fields, model };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
