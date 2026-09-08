// HTTP 202 is not a completed generation. Advice and durable storage are
// independent: callers expose run/order persistence alongside generated text.
export function advisorRunResult(httpStatus, data) {
  if (httpStatus === 202 || data?.status === "preview") return "needs_human";
  return httpStatus >= 200 && httpStatus < 300 && data?.status === "generated" && data?.text
    ? "ok"
    : "error";
}
