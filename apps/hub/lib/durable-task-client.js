const TERMINAL_STATUSES = new Set(["saved", "duplicate"]);

function normalizeCapture(input) {
  const destination = input?.destination === "inbox" ? "inbox" : "task";
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  return { destination, text };
}

function requestFor(capture) {
  if (capture.destination === "inbox") {
    return {
      url: "/api/hub/inbox",
      body: { raw: capture.text },
    };
  }

  return {
    url: "/api/hub/tasks",
    body: { title: capture.text },
  };
}

function defaultKeyFactory() {
  return `quick-capture:${crypto.randomUUID()}`;
}

function clientFailure(reason, error) {
  return {
    status: "failed",
    retryable: true,
    reason,
    error,
  };
}

function normalizeHttpResult(response, resultBody) {
  if (response.ok || !TERMINAL_STATUSES.has(resultBody.status)) return resultBody;

  return {
    ...resultBody,
    status: "failed",
    retryable: response.status >= 500 || response.status === 408 || response.status === 429,
    reason: resultBody.reason || "non-ok-terminal-response",
    error: resultBody.error || `저장 요청이 HTTP ${response.status}로 실패했습니다.`,
  };
}

export function createDurableTaskClient({
  fetchImpl = fetch,
  keyFactory = defaultKeyFactory,
} = {}) {
  const attempts = new Map();

  function submit(input) {
    const capture = normalizeCapture(input);
    const fingerprint = JSON.stringify(capture);
    let attempt = attempts.get(fingerprint);

    if (attempt?.pending) return attempt.pending;
    if (!attempt) {
      attempt = { idempotencyKey: keyFactory(), pending: null };
      attempts.set(fingerprint, attempt);
    }

    const request = requestFor(capture);
    const pending = (async () => {
      try {
        const response = await fetchImpl(request.url, {
          method: "POST",
          headers: new Headers({
            "content-type": "application/json",
            "idempotency-key": attempt.idempotencyKey,
          }),
          body: JSON.stringify(request.body),
        });
        const body = await response.json().catch(() => null);
        const resultBody = body && typeof body === "object" && !Array.isArray(body)
          ? body
          : clientFailure("invalid-response", "저장 응답을 확인할 수 없습니다.");
        const result = {
          ...normalizeHttpResult(response, resultBody),
          httpStatus: response.status,
          ...(response.status === 401 ? { requiresUnlock: true } : {}),
        };

        if (TERMINAL_STATUSES.has(result.status)) {
          attempts.delete(fingerprint);
        } else {
          attempt.pending = null;
        }

        return result;
      } catch (error) {
        attempt.pending = null;
        return clientFailure(
          "network",
          error instanceof Error ? error.message : String(error),
        );
      }
    })();

    attempt.pending = pending;
    return pending;
  }

  function unlockSession({ secret, onSecretConsumed } = {}) {
    const consumedSecret = typeof secret === "string" ? secret : "";
    onSecretConsumed?.();

    return (async () => {
      try {
        const response = await fetchImpl("/api/hub/session", {
          method: "POST",
          headers: new Headers({ "content-type": "application/json" }),
          body: JSON.stringify({ secret: consumedSecret }),
        });
        const body = await response.json().catch(() => null);

        return {
          unlocked: response.ok && body?.unlocked === true,
          httpStatus: response.status,
        };
      } catch {
        return { unlocked: false, httpStatus: 0 };
      }
    })();
  }

  return { submit, unlockSession };
}
