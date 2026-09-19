import { logEngineRejection } from "./engine-client-log.js";

const SHARED_SECRET_HEADER = "x-com-moon-shared-secret";

export async function forwardMemoLinkCommand(
  command,
  { env = process.env, fetchImpl = fetch, logger = console.error } = {},
) {
  const engineUrl = String(env.COM_MOON_ENGINE_URL || "").trim().replace(/\/$/, "");
  const sharedSecret = String(env.COM_MOON_SHARED_WEBHOOK_SECRET || "").trim();

  if (!engineUrl) {
    return {
      ok: false,
      httpStatus: 202,
      data: { status: "preview", error: "engine-not-configured" },
    };
  }
  if (!sharedSecret) {
    return {
      ok: false,
      httpStatus: 503,
      data: { status: "error", error: "shared-secret-not-configured" },
    };
  }

  try {
    const response = await fetchImpl(`${engineUrl}/api/memo-links/command`, {
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
      status: response.status === 409 ? "conflict" : "error",
      error: `engine-http-${response.status}`,
    }));
    const publicData = data && typeof data === "object"
      ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== "detail"))
      : { status: "error", error: `engine-http-${response.status}` };

    if (!response.ok) logEngineRejection(logger, "memo-link", command, response.status, data);

    return {
      ok: response.ok,
      httpStatus: response.status,
      data: publicData,
    };
  } catch (error) {
    logEngineRejection(logger, "memo-link", command, "transport", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      httpStatus: 502,
      data: {
        status: "error",
        error: "engine-unreachable",
        retryable: true,
      },
    };
  }
}
