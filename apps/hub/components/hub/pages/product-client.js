// 제품 카탈로그 화면의 요청·봉투 해석 (React 비의존, product-client.test.mjs가 고정).
// 읽기: HTTP 200 + { status } 봉투를 읽는다 — !r.ok만 보면 read 실패가 빈 목록으로 위장된다(CLAUDE.md).
// 쓰기: { ok, status, message, entity } — preview는 저장되지 않았다는 뜻이다(DESIGN §8.1 Save envelope).

import { productErrorText } from "../../../lib/product-catalog.js";

const SAVED = new Set(["saved", "duplicate"]);
const READ_STATES = new Set(["live", "partial", "preview", "error"]);
const httpOk = (status) => status >= 200 && status < 300;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

// Fetch와 본문 읽기에 같은 마감 시간을 적용한다. 취소를 무시하는 transport도 대기를 끝낸다.
// 호출자 취소는 AbortError로 전달하고, 자체 timeout은 화면의 오류 봉투로 바꾼다.
async function requestJson(url, options = {}, timeoutMs = 15_000) {
  const { signal, ...init } = options;
  const cancelled = () => new DOMException("Request cancelled", "AbortError");
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController();
  let cancel;
  let timer;
  const stopped = new Promise((_, reject) => {
    const stop = (error) => { reject(error); controller.abort(error); };
    cancel = () => stop(cancelled());
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => stop(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null);
        return { response, data };
      })(),
      stopped,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function readEnvelope(response, data, empty) {
  if (!response.ok || !object(data) || !READ_STATES.has(data.status)) {
    return { ...empty, status: "error", error: `http-${response.status}` };
  }
  if (data.status === "error" || data.source === "error") {
    return { ...data, ...empty, status: "error" };
  }
  if (data.status === "preview") return { ...data, ...empty };
  if (!Array.isArray(data.products) || Object.keys(empty).some((key) => Array.isArray(empty[key]) && key in data && !Array.isArray(data[key]))) {
    return { ...empty, status: "error", error: "invalid-response" };
  }
  return { ...empty, ...data };
}

export function readSaveOutcome(httpStatus, data) {
  const status = data?.status;
  if (httpOk(httpStatus) && SAVED.has(status)) return { ok: true, status, entity: data.entity || null };
  if (status === "preview" || data?.error === "missing-config" || data?.error === "engine-not-configured") {
    return { ok: false, status: "error", message: "Engine·Supabase 연결이 없어 저장되지 않았어요." };
  }
  if (status === "conflict") return { ok: false, status: "conflict", message: productErrorText(data?.error), entity: data?.entity || null };
  return { ok: false, status: "error", unknownOutcome: httpStatus >= 500 || (httpOk(httpStatus) && status !== "invalid-input"), message: productErrorText(data?.error || (httpStatus ? `http-${httpStatus}` : null), data) };
}

async function send(url, method, body) {
  try {
    const { response, data } = await requestJson(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return readSaveOutcome(response.status, data);
  } catch {
    return { ok: false, status: "error", unknownOutcome: true, message: "저장 결과를 확인하지 못했어요. 입력은 그대로예요. 다시 시도해 주세요." };
  }
}

export async function readProducts(signal) {
  try {
    const { response, data } = await requestJson("/api/hub/products", { signal });
    return readEnvelope(response, data, { products: [], candidates: [], inquiries: [], inquiryCandidates: [], areas: [], missing: [] });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: "error", error: error?.name === "TimeoutError" ? "timeout" : "network", products: [], candidates: [] };
  }
}

// Engine GET /api/integrations/github/sync → { status: { configured, tokenConfigured, ... } }.
// Engine이 없으면 Hub 프록시가 { status: "preview" } 문자열 상태를 돌려준다.
export async function readGitHubStatus(signal) {
  try {
    const { response, data } = await requestJson("/api/integrations/github/sync", { signal });
    if (!response.ok || data?.source === "error") return { state: "error" };
    if (object(data?.status) && typeof data.status.configured === "boolean") return { ...data.status, state: "live" };
    return { state: data?.status === "preview" ? "preview" : "error" };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { state: "error" };
  }
}

export async function runGitHubSync() {
  try {
    const { response, data } = await requestJson("/api/integrations/github/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }, 60_000);
    return summarizeSyncResult(response.status, data);
  } catch {
    return { ok: false, tone: "danger", message: "동기화 결과를 확인하지 못했어요. 잠시 뒤 상태를 확인해 주세요." };
  }
}

export function summarizeSyncResult(httpStatus, data) {
  const status = data?.status;
  if (httpOk(httpStatus) && status === "synced") return { ok: true, tone: "neutral", message: `저장소 ${data.repositories?.length || 0}개를 동기화했어요.` };
  if (httpOk(httpStatus) && status === "partial") return { ok: true, tone: "danger", message: `일부 저장소만 동기화했어요 (실패 ${data.failures?.length || 0}개).` };
  if (status === "preview") {
    return { ok: false, tone: "neutral", message: data?.configured === false ? "제품에 연결된 저장소가 없어요." : "Engine 연결이 없어 동기화하지 못했어요." };
  }
  return { ok: false, tone: "danger", message: `동기화하지 못했어요${httpStatus ? ` (${httpStatus})` : ""}.` };
}

export const createProduct = (body) => send("/api/hub/products", "POST", body);
export const updateProduct = (body) => send("/api/hub/products", "PATCH", body);
export const connectRepository = (body) => send("/api/hub/products/repositories", "POST", body);
export const updateRepository = (body) => send("/api/hub/products/repositories", "PATCH", body);
export const disconnectRepository = (id) => send("/api/hub/products/repositories", "DELETE", { id });
// 프로젝트 ↔ 제품 연결은 기존 프로젝트 쓰기 경로(update_project)의 productId 한 칸이다.
export const linkProject = (projectId, productId) => send("/api/hub/projects", "PATCH", { id: projectId, productId });

// 문의 ↔ 제품(·일). productId가 null이면 연결을 푼다. projectId는 같은 제품의 일만.
export const linkInquiry = (inquiryId, productId, projectId = null) => productId
  ? send("/api/hub/products/inquiries", "POST", { inquiryId, productId, projectId })
  : send("/api/hub/products/inquiries", "DELETE", { inquiryId });

// 월 숫자(주간 사용자·매출·비용) 수동 기록 — 들어온 칸만 고친다.
export const recordMonth = (body) => send("/api/hub/products/metrics", "POST", body);

// 제품에 붙은 일(프로젝트) 만들기 — 기존 프로젝트 쓰기 경로(create_project)에 productId·workType을 싣는다.
export const createWork = (body) => send("/api/hub/projects", "POST", body);
export const updateWork = (body) => send("/api/hub/projects", "PATCH", body);

export async function readInquiryProduct(inquiryId, signal) {
  try {
    const { response, data } = await requestJson(`/api/hub/products/inquiries?inquiry=${encodeURIComponent(inquiryId)}`, { signal });
    return readEnvelope(response, data, { products: [], productId: null });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: "error", products: [], productId: null };
  }
}

// Codex 작업 초안 넘기기 — URL에 로그·주소를 싣지 않고 이 탭의 sessionStorage로 한 번만 건넨다.
export const CODEX_DRAFT_KEY = "mlp.codex.draft";

export function buildCodexDraft(product, repository) {
  const ci = repository?.summary?.ci || {};
  const lines = [
    `${product.name} 제품의 ${repository.fullName} 기본 브랜치(${repository.defaultBranch}) CI가 실패했어요.`,
    ci.failed?.length ? `실패한 check: ${ci.failed.join(", ")}` : null,
    ci.url ? `실패 로그: ${ci.url}` : null,
    "원인을 찾고 고칠 방법을 정리해 주세요. 수정이 필요하면 변경 범위를 먼저 알려 주세요.",
  ];
  return lines.filter(Boolean).join("\n");
}
