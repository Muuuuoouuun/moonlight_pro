interface GeminiGenerateInput {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  // Structured-output controls. When responseMimeType is "application/json" the model
  // returns JSON as a text part (still read via extractGeminiText + JSON.parse). Precedent:
  // apps/hub/lib/google-vision.js. Omitted → identical body to before (no regression).
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  // Bound the thinking-model's reasoning tokens. On gemini-3-flash-preview thinking tokens
  // share the output budget, so an unbounded think can truncate a short JSON draft mid-object.
  // Capping thinking (e.g. 512) leaves room for the answer. Pass 0 to disable where supported.
  // typeof-number guard means 0 is honored (not treated as "unset").
  thinkingBudget?: number;
}

function resolveGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

export function getGeminiIntegrationStatus() {
  return {
    configured: Boolean(resolveGeminiApiKey()),
    provider: "gemini",
    model:
      process.env.GEMINI_MODEL?.trim() ||
      process.env.AI_DEFAULT_MODEL?.trim() ||
      "gemini-3-flash-preview",
    apiBaseUrl:
      process.env.GEMINI_API_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta",
  };
}

function extractGeminiText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function generateGeminiText(input: GeminiGenerateInput) {
  const apiKey = resolveGeminiApiKey();
  const status = getGeminiIntegrationStatus();

  if (!apiKey) {
    return {
      ok: false,
      status: null,
      reason: "missing-api-key",
      text: "",
      model: status.model,
    };
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens || 768,
      ...(input.responseMimeType ? { responseMimeType: input.responseMimeType } : {}),
      ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      ...(typeof input.thinkingBudget === "number"
        ? { thinkingConfig: { thinkingBudget: input.thinkingBudget } }
        : {}),
    },
  };

  if (input.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  try {
    const response = await fetch(
      `${status.apiBaseUrl.replace(/\/$/, "")}/models/${status.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: data?.error?.message || `http-${response.status}`,
        text: "",
        model: status.model,
      };
    }

    return {
      ok: true,
      status: response.status,
      reason: "ok",
      text: extractGeminiText(data),
      model: status.model,
      usageMetadata: data?.usageMetadata || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
      text: "",
      model: status.model,
    };
  }
}
