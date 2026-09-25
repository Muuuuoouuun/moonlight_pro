// GitHub webhook 수신 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §5.2 보안·신뢰 계약).
// - 서명(X-Hub-Signature-256) 불일치는 401이고 아무것도 기록하지 않는다. 비밀값이 없으면 503으로 닫는다.
// - X-GitHub-Delivery를 webhook_events.provider_event_id로 먼저 적어 중복 배달을 막는다(0002 unique 인덱스).
// - 연결되지 않은 저장소의 이벤트는 저장만 하고(ignored, matched:false) 제품을 추측하지 않는다.

import { randomUUID } from "crypto";

import { mapGitHubWebhookEvent, verifyGitHubSignature } from "./github-signals.ts";
import type { MappedEvent, RepositoryLink } from "./github-signals.ts";

type Row = Record<string, unknown>;
type WriteResult = { persisted: boolean; reason: string; detail?: string; records?: Row[] };

export type GitHubWebhookDependencies = {
  fetchRows: (table: string, options?: Row) => Promise<Row[] | null>;
  insert: (table: string, record: Row) => Promise<WriteResult>;
  update: (table: string, filters: Array<[string, string]>, patch: Row) => Promise<WriteResult>;
};

export type GitHubWebhookInput = {
  secret: string;
  workspaceId: string | null;
  rawBody: string;
  headers: { signature: string | null; event: string | null; delivery: string | null };
  now?: string;
};

export async function handleGitHubWebhook(input: GitHubWebhookInput, deps: GitHubWebhookDependencies) {
  if (!input.secret) return { httpStatus: 503, body: { status: "error", error: "github-webhook-secret-not-configured" } };
  if (!verifyGitHubSignature(input.secret, input.rawBody, input.headers.signature)) {
    return { httpStatus: 401, body: { status: "unauthorized", error: "invalid-signature" } };
  }
  const event = (input.headers.event || "").trim().slice(0, 60);
  const delivery = (input.headers.delivery || "").trim().slice(0, 120);
  if (!event || !delivery) return { httpStatus: 400, body: { status: "invalid-input", error: "missing-github-headers" } };

  let payload: Row;
  try {
    const parsed = JSON.parse(input.rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not-object");
    payload = parsed as Row;
  } catch {
    return { httpStatus: 400, body: { status: "invalid-json" } };
  }
  if (!input.workspaceId) return { httpStatus: 202, body: { status: "preview", error: "missing-workspace" } };
  const now = input.now || new Date().toISOString();

  const repository = payload.repository && typeof payload.repository === "object" ? payload.repository as Row : {};
  const fullName = typeof repository.full_name === "string" ? repository.full_name.trim().toLowerCase().slice(0, 200) : "";
  let link: RepositoryLink & { id: string } | null = null;
  if (fullName) {
    const rows = await deps.fetchRows("product_repositories", {
      filters: [["workspace_id", `eq.${input.workspaceId}`], ["full_name", `eq.${fullName}`]],
      limit: 1,
    });
    if (rows === null) return { httpStatus: 502, body: { status: "error", error: "repository-lookup-failed" } };
    const row = rows[0];
    if (row && row.status !== "disabled") {
      link = {
        id: String(row.id),
        product_id: String(row.product_id),
        full_name: String(row.full_name),
        default_branch: String(row.default_branch || "main"),
        last_summary: row.last_summary && typeof row.last_summary === "object" ? row.last_summary as Row : {},
      };
    }
  }

  const mapped: MappedEvent = link
    ? mapGitHubWebhookEvent(event, payload, link, now)
    : { ignored: fullName ? "unconnected-repository" : "no-repository" };
  const ignored = mapped.ignored || null;

  // 중복 배달 차단이 먼저다 — 같은 delivery로 신호가 두 번 기록되지 않는다.
  const eventRecord = await deps.insert("webhook_events", {
    id: randomUUID(),
    workspace_id: input.workspaceId,
    event_type: `github.${event}`,
    source: "github",
    status: ignored ? "ignored" : "processed",
    provider_event_id: delivery,
    correlation_id: delivery,
    // 원문 전체가 아니라 라우팅에 필요한 요약만 남긴다.
    payload: {
      repository: fullName || null,
      action: typeof payload.action === "string" ? payload.action.slice(0, 40) : null,
      matched: Boolean(link),
      productId: link?.product_id || null,
      ...(ignored ? { ignored } : {}),
    },
    received_at: now,
    processed_at: now,
  });
  if (!eventRecord.persisted) {
    if (eventRecord.reason === "duplicate") return { httpStatus: 200, body: { status: "duplicate", delivery } };
    if (eventRecord.reason === "missing-config") return { httpStatus: 202, body: { status: "preview", error: "missing-config" } };
    return { httpStatus: 502, body: { status: "error", error: "webhook-event-write-failed" } };
  }
  if (mapped.ignored !== undefined || !link) {
    return { httpStatus: 200, body: { status: "ignored", reason: ignored, matched: Boolean(link) } };
  }

  const writes: Row = {};
  if (mapped.update) {
    const update = await deps.insert("project_updates", {
      workspace_id: input.workspaceId,
      project_id: null,
      product_id: link.product_id,
      source: "github",
      ...mapped.update,
      provider_event_id: delivery,
      correlation_id: delivery,
      happened_at: now,
    });
    writes.projectUpdate = update.persisted ? "saved" : update.reason;
  }
  if (Object.keys(mapped.summaryPatch).length) {
    const summary = await deps.update(
      "product_repositories",
      [["id", `eq.${link.id}`], ["workspace_id", `eq.${input.workspaceId}`]],
      { last_summary: { ...(link.last_summary || {}), ...mapped.summaryPatch }, updated_at: now },
    );
    writes.repositorySummary = summary.persisted ? "saved" : summary.reason;
  }
  const failed = Object.values(writes).some((value) => value !== "saved");
  return {
    httpStatus: failed ? 207 : 200,
    body: { status: failed ? "partial" : "processed", event, productId: link.product_id, writes },
  };
}
