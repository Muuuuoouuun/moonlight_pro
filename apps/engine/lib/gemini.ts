export interface GeminiGenerateInput {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  fallbackModel?: string;
  retryOnTransient?: boolean;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateResult {
  ok: boolean;
  status: number | null;
  reason: string;
  text: string;
  model: string;
  usageMetadata?: GeminiUsageMetadata | null;
  latencyMs: number;
  fallbackFrom?: string;
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
    proModel:
      process.env.GEMINI_PRO_MODEL?.trim() ||
      "gemini-2.5-pro",
    flashModel:
      process.env.GEMINI_FLASH_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-2.5-flash",
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGeminiWithTimeout(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 45_000
) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function generateGeminiText(
  input: GeminiGenerateInput
): Promise<GeminiGenerateResult> {
  const startTime = performance.now();
  const apiKey = resolveGeminiApiKey();
  const status = getGeminiIntegrationStatus();
  const primaryModel = input.model?.trim() || status.model;
  const fallbackModel = input.fallbackModel?.trim() || null;

  if (!apiKey) {
    return {
      ok: false,
      status: null,
      reason: "missing-api-key",
      text: "",
      model: primaryModel,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  const generationConfig: Record<string, unknown> = {
    // gemini-3-* and thinking models count thinking tokens against maxOutputTokens
    maxOutputTokens: input.maxOutputTokens || 8192,
  };

  if (typeof input.temperature === "number") {
    generationConfig.temperature = input.temperature;
  }
  if (typeof input.topP === "number") {
    generationConfig.topP = input.topP;
  }
  if (typeof input.topK === "number") {
    generationConfig.topK = input.topK;
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig,
  };

  if (input.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  const executeRequest = async (targetModel: string) => {
    const url = `${status.apiBaseUrl.replace(/\/$/, "")}/models/${targetModel}:generateContent`;
    let response: Response;
    try {
      response = await fetchGeminiWithTimeout(url, apiKey, body);
    } catch (err) {
      return {
        ok: false as const,
        status: null,
        reason: err instanceof Error ? err.message : String(err),
        isTransient: true,
      };
    }

    const text = await response.text().catch(() => "");
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const isTransient = response.status === 429 || response.status === 503 || response.status === 504;
      return {
        ok: false as const,
        status: response.status,
        reason: data?.error?.message || `http-${response.status}`,
        isTransient,
      };
    }

    return {
      ok: true as const,
      status: response.status,
      text: extractGeminiText(data),
      usageMetadata: data?.usageMetadata || null,
    };
  };

  // Attempt 1 with primaryModel
  let result = await executeRequest(primaryModel);

  // Transient retry with backoff (e.g. 429 / 503 / timeout)
  if (!result.ok && result.isTransient && input.retryOnTransient !== false) {
    await sleep(200);
    result = await executeRequest(primaryModel);
  }

  // If primaryModel succeeded, return
  if (result.ok) {
    return {
      ok: true,
      status: result.status,
      reason: "ok",
      text: result.text,
      model: primaryModel,
      usageMetadata: result.usageMetadata,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  // If failed and fallbackModel is provided and distinct from primaryModel, attempt fallback
  if (fallbackModel && fallbackModel !== primaryModel) {
    let fallbackResult = await executeRequest(fallbackModel);
    if (!fallbackResult.ok && fallbackResult.isTransient && input.retryOnTransient !== false) {
      await sleep(200);
      fallbackResult = await executeRequest(fallbackModel);
    }

    if (fallbackResult.ok) {
      return {
        ok: true,
        status: fallbackResult.status,
        reason: "ok",
        text: fallbackResult.text,
        model: fallbackModel,
        fallbackFrom: primaryModel,
        usageMetadata: fallbackResult.usageMetadata,
        latencyMs: Math.round(performance.now() - startTime),
      };
    }
  }

  return {
    ok: false,
    status: result.status,
    reason: result.reason,
    text: "",
    model: primaryModel,
    latencyMs: Math.round(performance.now() - startTime),
  };
}
