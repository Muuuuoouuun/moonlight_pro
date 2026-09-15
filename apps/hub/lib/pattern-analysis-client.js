export async function forwardPatternAnalysis(
  payload,
  { env = process.env, fetchImpl = fetch } = {}
) {
  const base = env.COM_MOON_ENGINE_URL?.trim().replace(/\/$/, "");
  const secret = env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim();

  if (!base || !secret) {
    return {
      httpStatus: 202,
      data: {
        status: "preview",
        requestId: payload.requestId || "",
        goal: payload.goal || "general",
        recordCount: payload.records?.length || 0,
        patterns: [
          {
            id: "preview-pattern-1",
            kind: payload.goal || "general",
            title: "패턴 분석 엔진 프리뷰 모드",
            observation: "선택된 메모의 패턴 분석 엔진이 프리뷰 상태로 작동 중입니다.",
            interpretation: "엔진 연결(COM_MOON_ENGINE_URL) 시 실시간 분석이 실행됩니다.",
            actionableGuidance: "엔진 환경 변수를 설정하거나 로컬 엔진을 기동하세요.",
            suggestedTarget: "task",
            evidenceQuotes: payload.records?.[0]
              ? [
                  {
                    journalId: payload.records[0].id,
                    quote: (payload.records[0].body || payload.records[0].title || "").slice(0, 60),
                    occurredAt: payload.records[0].occurredAt,
                  },
                ]
              : [],
          },
        ],
        unverifiedQuotesFiltered: 0,
      },
    };
  }

  try {
    const response = await fetchImpl(`${base}/api/ai/pattern-analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json().catch(() => null);
    if (!result) {
      return {
        httpStatus: 502,
        data: { status: "failed", error: "invalid-engine-response" },
      };
    }

    return {
      httpStatus: response.status,
      data: result,
    };
  } catch (err) {
    return {
      httpStatus: 502,
      data: { status: "failed", error: "engine-unreachable", message: err.message },
    };
  }
}
