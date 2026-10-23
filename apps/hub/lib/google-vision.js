// Gemini vision: business-card image -> structured fields. Raw fetch, no SDK.
// Provider routing/authentication is shared with Engine.
import { recordAiUsage } from "./ai-usage-log.js";
import { getGenaiStatus, prepareGenaiRequest, resolveGenaiApiKey } from '@com-moon/genai-transport';

function resolveModel() {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

const PROMPT = `이 명함 이미지에서 아래 필드를 추출해 JSON만 출력해. 불확실한 값은 추측하지 말고 null로 둬.
{"name": 사람 이름 또는 null, "company": 회사/학원/기관명 또는 null, "phone": 전화번호 또는 null, "email": 이메일 또는 null, "title": 직책 또는 null, "address": 주소 또는 null}`;

export function getVisionStatus() {
  const status = getGenaiStatus();
  return { ...status, apiKey: status.backend === 'developer' ? resolveGenaiApiKey() : '', model: resolveModel(), base: status.apiBaseUrl };
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
}

// imageBase64: base64 string (no data: prefix). Returns { ok, fields, error }.
export async function extractBusinessCard(imageBase64, mimeType = "image/jpeg") {
  const { configured, model } = getVisionStatus();
  if (!configured) {
    return { ok: false, error: "AI connection not configured", fields: null };
  }
  if (!imageBase64) {
    return { ok: false, error: "missing image data", fields: null };
  }

  let response;
  let raw;
  try {
    const signal = AbortSignal.timeout(30_000);
    const request = await prepareGenaiRequest(model, { signal });
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      cache: "no-store",
      signal,
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
