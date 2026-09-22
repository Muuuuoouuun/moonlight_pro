export interface GeminiMediaPart {
  mimeType: string;
  base64: string;
}

export interface GeminiGenerateInput {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  model?: string;
  signal?: AbortSignal;
  responseJsonSchema?: Record<string, unknown>;
  thinkingLevel?: 'low' | 'high';
  media?: GeminiMediaPart[];
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
      "gemini-3.5-flash",
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
  const targetModel = input.model?.trim() || status.model;

  if (!apiKey) {
    return {
      ok: false,
      status: null,
      reason: "missing-api-key",
      text: "",
      model: targetModel,
    };
  }

  const userParts: Record<string, unknown>[] = [{ text: input.prompt }];
  if (Array.isArray(input.media)) {
    for (const item of input.media) {
      if (item?.mimeType && item?.base64) {
        userParts.push({
          inlineData: {
            mimeType: item.mimeType,
            data: item.base64,
          },
        });
      }
    }
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: userParts,
      },
    ],
    generationConfig: {
      // gemini-3-* are thinking models: thinking tokens count against maxOutputTokens, so a
      // low cap starves the visible answer and truncates it mid-sentence. Keep headroom for
      // thinking + a full answer. maxOutputTokens is a cap, not a charge — billing is per
      // actual token — so a generous default is safe.
      maxOutputTokens: input.maxOutputTokens || 8192,
      ...(input.responseJsonSchema ? {
        responseMimeType: "application/json", responseJsonSchema: input.responseJsonSchema,
      } : {}),
      // Gemini 2.5 uses thinkingBudget; do not send an incompatible 3-series option.
      ...(input.thinkingLevel && /^gemini-3[.-]/.test(targetModel) ? {
        thinkingConfig: { thinkingLevel: input.thinkingLevel },
      } : {}),
    },
  };

  if (input.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  try {
    const response = await fetch(
      `${status.apiBaseUrl.replace(/\/$/, "")}/models/${targetModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
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
        model: targetModel,
      };
    }

    return {
      ok: true,
      status: response.status,
      reason: "ok",
      text: extractGeminiText(data),
      model: targetModel,
      usageMetadata: data?.usageMetadata || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: error instanceof Error ? error.message : String(error),
      text: "",
      model: targetModel,
    };
  }
}
