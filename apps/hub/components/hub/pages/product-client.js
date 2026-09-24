// 제품 카탈로그 화면의 요청·봉투 해석 (React 비의존, product-client.test.mjs가 고정).
// 읽기: HTTP 200 + { status } 봉투를 읽는다 — !r.ok만 보면 read 실패가 빈 목록으로 위장된다(CLAUDE.md).
// 쓰기: { ok, status, message, entity } — preview는 저장되지 않았다는 뜻이다(DESIGN §8.1 Save envelope).

import { productErrorText } from "../../../lib/product-catalog.js";

const SAVED = new Set(["saved", "duplicate"]);

export function readSaveOutcome(httpStatus, data) {
  const status = data?.status;
  if (SAVED.has(status)) return { ok: true, status, entity: data.entity || null };
  if (status === "preview" || data?.error === "missing-config" || data?.error === "engine-not-configured") {
    return { ok: false, status: "error", message: "Engine·Supabase 연결이 없어 저장되지 않았어요." };
  }
  if (status === "conflict") return { ok: false, status: "conflict", message: productErrorText(data?.error), entity: data?.entity || null };
  return { ok: false, status: "error", message: productErrorText(data?.error || (httpStatus ? `http-${httpStatus}` : null)) };
}

async function send(url, method, body) {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    return readSaveOutcome(response.status, data);
  } catch {
    return { ok: false, status: "error", message: "네트워크 오류로 저장하지 못했어요. 입력은 그대로예요." };
  }
}

export async function readProducts(signal) {
  try {
    const response = await fetch("/api/hub/products", { cache: "no-store", signal });
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return { status: "error", error: `http-${response.status}`, products: [], candidates: [] };
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: "error", error: "network", products: [], candidates: [] };
  }
}

// Engine GET /api/integrations/github/sync → { status: { configured, tokenConfigured, ... } }.
// Engine이 없으면 Hub 프록시가 { status: "preview" } 문자열 상태를 돌려준다.
export async function readGitHubStatus(signal) {
  try {
    const response = await fetch("/api/integrations/github/sync", { cache: "no-store", signal });
    const data = await response.json().catch(() => null);
    if (data?.status && typeof data.status === "object") return { state: "live", ...data.status };
    return { state: data?.status === "preview" ? "preview" : "error" };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { state: "error" };
  }
}

export async function runGitHubSync() {
  try {
    const response = await fetch("/api/integrations/github/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    return summarizeSyncResult(response.status, data);
  } catch {
    return { ok: false, tone: "danger", message: "Engine에 연결하지 못했어요." };
  }
}

export function summarizeSyncResult(httpStatus, data) {
  const status = data?.status;
  if (status === "synced") return { ok: true, tone: "neutral", message: `저장소 ${data.repositories?.length || 0}개를 동기화했어요.` };
  if (status === "partial") return { ok: true, tone: "danger", message: `일부 저장소만 동기화했어요 (실패 ${data.failures?.length || 0}개).` };
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
