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
  // Structured-output knobs. Callers that need a machine-parseable answer (the Council
  // content-draft / Guru followup-draft modes, card-news) ask for JSON at the API layer
  // instead of trusting the prompt alone, and cap thinking so a runaway think cannot
  // truncate the JSON mid-object. Matches CardNewsTextGenerator in
  // packages/content-manager/card-news/generator.ts.
  responseMimeType?: string;
  thinkingBudget?: number;
}

const FAILURE_CATEGORIES = new Set([
  'missing-api-key', 'timeout', 'aborted', 'network-error', 'authentication',
  'rate-limit', 'provider-unavailable', 'invalid-request', 'http-error',
  'invalid-json', 'blocked-prompt', 'blocked-output', 'incomplete-output',
  'empty-output', 'provider-error',
]);
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII',
  'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION',
]);
const USAGE_FIELDS = [
  'promptTokenCount', 'candidatesTokenCount', 'totalTokenCount',
  'cachedContentTokenCount', 'thoughtsTokenCount', 'toolUsePromptTokenCount',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function enumValue(value: unknown) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : null;
}

// Keep diagnostic fields only: provider messages, thought text, and safety explanations
// may contain request data and must not enter the evaluation trace.
export function getGeminiResponseDiagnostics(value: unknown) {
  const data = asRecord(value);
  const candidate = asRecord(Array.isArray(data.candidates) ? data.candidates[0] : null);
  const rawUsage = asRecord(data.usageMetadata);
  const usageMetadata: Record<string, number> = {};
  for (const field of USAGE_FIELDS) {
    const count = rawUsage[field];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) usageMetadata[field] = count;
  }
  const blockReason = enumValue(asRecord(data.promptFeedback).blockReason);
  return {
    modelVersion: typeof data.modelVersion === 'string' && /^[a-zA-Z0-9._:/@-]{1,200}$/.test(data.modelVersion) ? data.modelVersion : null,
    finishReason: enumValue(data.finishReason ?? candidate.finishReason),
    usageMetadata: Object.keys(usageMetadata).length ? usageMetadata : null,
    promptFeedback: blockReason ? { blockReason } : null,
  };
}

// Classify known machine fields, never free-form error messages. Also accepts the
// helper result so evaluation can safely classify older/injected providers.
export function classifyGeminiFailure(value: unknown, signal?: AbortSignal): string {
  const data = asRecord(value);
  if (typeof data.failureCategory === 'string' && FAILURE_CATEGORIES.has(data.failureCategory)) return data.failureCategory;
  const abortName = asRecord(signal?.reason).name;
  if (signal?.aborted) return abortName === 'TimeoutError' ? 'timeout' : 'aborted';
  if (data.name === 'TimeoutError' || data.code === 'ETIMEDOUT' || data.code === 'UND_ERR_CONNECT_TIMEOUT' || data.code === 'UND_ERR_HEADERS_TIMEOUT' || data.code === 'UND_ERR_BODY_TIMEOUT') return 'timeout';
  if (data.name === 'AbortError' || data.code === 'ABORT_ERR') return 'aborted';
  const reason = data.reason;
  if (typeof reason === 'string' && FAILURE_CATEGORIES.has(reason)) return reason;
  if (reason === 'max_tokens') return 'incomplete-output';
  const blockReason = asRecord(data.promptFeedback).blockReason;
  if (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED') return 'blocked-prompt';
  if (typeof data.finishReason === 'string' && data.finishReason !== 'STOP') return BLOCKED_FINISH_REASONS.has(data.finishReason) ? 'blocked-output' : 'incomplete-output';
  if (data.status === 401 || data.status === 403) return 'authentication';
  if (data.status === 429) return 'rate-limit';
  if (typeof data.status === 'number' && data.status >= 500) return 'provider-unavailable';
  if (typeof data.status === 'number' && data.status >= 400) return 'invalid-request';
  if (typeof data.status === 'number' && data.status >= 300) return 'http-error';
  const cause = asRecord(data.cause);
  if (cause.code === 'ETIMEDOUT' || cause.code === 'UND_ERR_CONNECT_TIMEOUT' || cause.code === 'UND_ERR_HEADERS_TIMEOUT' || cause.code === 'UND_ERR_BODY_TIMEOUT') return 'timeout';
  if (data.name === 'TypeError' || typeof data.code === 'string' && /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET)$/.test(data.code) || typeof cause.code === 'string' && /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET)$/.test(cause.code)) return 'network-error';
  return 'provider-error';
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

function extractGeminiText(data: unknown) {
  const candidates = asRecord(data).candidates;
  const candidate = asRecord(Array.isArray(candidates) ? candidates[0] : null);
  const parts = asRecord(candidate.content).parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (part?.thought !== true && typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function generateGeminiText(input: GeminiGenerateInput) {
  const apiKey = resolveGeminiApiKey();
  const status = getGeminiIntegrationStatus();
  const targetModel = input.model?.trim() || status.model;
  const emptyDiagnostics = getGeminiResponseDiagnostics(null);

  if (!apiKey) {
    return {
      ok: false,
      status: null,
      reason: "missing-api-key",
      failureCategory: 'missing-api-key',
      ...emptyDiagnostics,
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

  const generationConfig = body.generationConfig as Record<string, unknown>;

  if (input.responseMimeType) {
    generationConfig.responseMimeType = input.responseMimeType;
  }

  // 0 is a meaningful budget (thinking off), so test for undefined rather than falsiness.
  if (typeof input.thinkingBudget === "number") {
    generationConfig.thinkingConfig = { thinkingBudget: input.thinkingBudget };
  }

  if (input.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
  let httpStatus: number | null = null;
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
        signal,
      },
    );
    httpStatus = response.status;
    const bodyText = await response.text();
    let data: unknown = null;
    let invalidJson = false;
    try { data = bodyText ? JSON.parse(bodyText) : null; }
    catch { invalidJson = true; }
    const diagnostics = getGeminiResponseDiagnostics(data);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: `http-${response.status}`,
        failureCategory: classifyGeminiFailure({ status: response.status }),
        ...diagnostics,
        text: "",
        model: targetModel,
      };
    }

    const text = extractGeminiText(data);
    const { finishReason, promptFeedback } = diagnostics;
    const failureCategory = invalidJson ? 'invalid-json'
      : promptFeedback && promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED' ? 'blocked-prompt'
      : finishReason !== 'STOP' ? (finishReason ? classifyGeminiFailure(diagnostics) : text ? 'incomplete-output' : 'empty-output')
      : !text ? 'empty-output' : null;

    return {
      ok: failureCategory === null,
      status: response.status,
      reason: failureCategory ? finishReason && finishReason !== 'STOP' ? finishReason.toLowerCase() : failureCategory : 'ok',
      failureCategory,
      ...diagnostics,
      text: failureCategory ? '' : text,
      model: targetModel,
    };
  } catch (error) {
    const failureCategory = classifyGeminiFailure(error, signal);
    return {
      ok: false,
      status: httpStatus,
      reason: failureCategory,
      failureCategory,
      ...emptyDiagnostics,
      text: "",
      model: targetModel,
    };
  }
}
