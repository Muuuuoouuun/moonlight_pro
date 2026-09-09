export async function forwardMemoCapture(
  input,
  { env = process.env, fetchImpl = fetch } = {},
) {
  const base = env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/, "");
  const secret = env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();
  if (!base || !secret)
    return {
      httpStatus: 503,
      data: { status: "error", error: "memo-engine-not-configured" },
    };
  try {
    const response = await fetchImpl(`${base}/api/memos/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": secret,
      },
      body: JSON.stringify(input),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    const status = [
      "saved",
      "duplicate",
      "conflict",
      "invalid-input",
      "preview",
      "error",
      "unauthorized",
    ].includes(result?.status)
      ? result.status
      : "error";
    return {
      httpStatus: response.status,
      data: {
        status,
        id: result?.id || null,
        error: result?.error ? "memo-capture-not-completed" : null,
      },
    };
  } catch {
    return {
      httpStatus: 502,
      data: { status: "error", error: "memo-engine-unreachable" },
    };
  }
}
