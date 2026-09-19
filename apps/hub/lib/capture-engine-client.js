import { logEngineRejection } from "./engine-client-log.js";

const SHARED_SECRET_HEADER = "x-com-moon-shared-secret";

export async function forwardCaptureCommand(
  command,
  { env = process.env, fetchImpl = fetch, logger = console.error } = {},
) {
  const engineUrl = String(env.COM_MOON_ENGINE_URL || "").trim().replace(/\/$/, "");
  const sharedSecret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim();

  if (!engineUrl) {
    return {
      ok: false,
      httpStatus: 202,
      data: { status: "preview", error: "engine-not-configured", retryable: true },
    };
  }
  if (!sharedSecret) {
    return {
      ok: false,
      httpStatus: 503,
      data: { status: "error", error: "shared-secret-not-configured", retryable: true },
    };
  }

  try {
    const response = await fetchImpl(`${engineUrl}/api/capture/command`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SHARED_SECRET_HEADER]: sharedSecret,
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json().catch(() => ({
      status: "error",
      error: `engine-http-${response.status}`,
      retryable: response.status >= 500,
    }));

    if (!response.ok) logEngineRejection(logger, "capture", command, response.status, data);

    return { ok: response.ok, httpStatus: response.status, data };
  } catch (error) {
    logEngineRejection(logger, "capture", command, "transport", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      httpStatus: 502,
      data: {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      },
    };
  }
}
