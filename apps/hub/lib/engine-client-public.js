export function sanitizeEngineResponse(data, httpStatus) {
  if (!data || typeof data !== "object") {
    return {
      status: httpStatus === 409 ? "conflict" : "error",
      error: `engine-http-${httpStatus}`,
    };
  }

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "detail"),
  );
}

export function engineTransportFailure() {
  return {
    status: "error",
    error: "engine-unreachable",
    retryable: true,
  };
}
