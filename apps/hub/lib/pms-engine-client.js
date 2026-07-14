const SHARED_SECRET_HEADER = "x-com-moon-shared-secret";

export async function forwardPmsCommand(
  command,
  { env = process.env, fetchImpl = fetch } = {},
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
    const response = await fetchImpl(`${engineUrl}/api/pms/command`, {
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
    }));

    return {
      ok: response.ok,
      httpStatus: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      data: {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
