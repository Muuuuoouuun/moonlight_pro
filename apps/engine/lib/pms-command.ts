import { parseDelivery, validateDelivery, completionIssue, validDay } from "../../../packages/project-delivery/index.ts";

type CommandContext = {
  workspaceId?: string;
  ownerId?: string | null;
  now?: string;
};

type NormalizedCommand =
  | {
      ok: true;
      action: string;
      table: "projects" | "tasks" | "brands" | "decisions";
      record?: Record<string, unknown>;
      filters?: Array<[string, string]>;
      patch?: Record<string, unknown>;
    }
  | { ok: false; reason: string };

const PROJECT_STATUSES = new Set(["draft", "active", "blocked", "completed", "archived"]);
const TASK_STATUSES = new Set(["inbox", "todo", "doing", "blocked", "done"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
// PMS container (brand) taxonomy — mirrors the Hub 2026-07-15 spec §4.1.
const BRAND_CATEGORIES = new Set(["sns-channel", "ka-deal", "general"]);
const BRAND_ORG_SCOPES = new Set(["classin", "personal"]);
// PostgreSQL's uuid type accepts the full 8-4-4-4-12 hexadecimal form. The live
// workspace and brand seeds intentionally use readable non-RFC variant values.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength = 500) {
  return text(value, maxLength) || null;
}

function uuid(value: unknown) {
  const normalized = text(value, 100);
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function nullableUuidField(input: Record<string, unknown>, primary: string, fallback: string) {
  const value = has(input, primary) ? input[primary] : input[fallback];
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return { ok: true, value: null };
  }
  const normalized = uuid(value);
  return normalized
    ? { ok: true, value: normalized }
    : { ok: false, value: null };
}

function projectEntityRef(value: unknown) {
  if (value === null || value === undefined) {
    return { ok: true, leadId: null, customerAccountId: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, leadId: null, customerAccountId: null };
  }

  const ref = value as Record<string, unknown>;
  const type = text(ref.type, 30).toLowerCase();
  const id = uuid(ref.id);
  if (!id || (type !== "lead" && type !== "customer_account")) {
    return { ok: false, leadId: null, customerAccountId: null };
  }

  return {
    ok: true,
    leadId: type === "lead" ? id : null,
    customerAccountId: type === "customer_account" ? id : null,
  };
}

function dateTime(value: unknown) {
  const normalized = text(value, 100);
  if (!normalized) return { ok: true, value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && !validDay(normalized)) return { ok: false, value: null };
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? { ok: false, value: null }
    : { ok: true, value: parsed.toISOString() };
}

function has(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function progress(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

type ChecklistItem = { id: string; title: string; done: boolean; note: string; dueAt?: string };
function taskChecklist(value: unknown): { ok: true; items: ChecklistItem[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || value.length > 50) return { ok: false, reason: "invalid-checklist" };
  const ids = new Set<string>();
  const items: ChecklistItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, reason: "invalid-checklist-item" };
    const id = uuid(item.id);
    if (!id || ids.has(id) || typeof item.title !== "string" || !item.title.trim()
      || item.title.length > 200 || typeof item.done !== "boolean"
      || (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 500))) {
      return { ok: false, reason: "invalid-checklist-item" };
    }
    if (item.dueAt != null && item.dueAt !== "") {
      if (typeof item.dueAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueAt)) return { ok: false, reason: "invalid-checklist-date" };
      const date = new Date(`${item.dueAt}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.dueAt) return { ok: false, reason: "invalid-checklist-date" };
    }
    ids.add(id);
    items.push({ id, title: item.title.trim(), done: item.done, note: (item.note || "").trim(), ...(item.dueAt ? { dueAt: item.dueAt as string } : {}) });
  }
  return { ok: true, items };
}

export function normalizePmsCommand(
  input: Record<string, unknown> = {},
  context: CommandContext = {},
): NormalizedCommand {
  const action = text(input.action, 50).toLowerCase();
  const workspaceId = uuid(context.workspaceId);
  const ownerId = uuid(context.ownerId);
  const now = dateTime(context.now || new Date().toISOString());

  if (!workspaceId) return { ok: false, reason: "missing-workspace" };
  if (!now.ok || !now.value) return { ok: false, reason: "invalid-now" };

  if (action === "create_project") {
    const id = uuid(input.id);
    const areaId = uuid(input.areaId ?? input.area_id);
    const title = text(input.title || input.name, 300);
    const brandId = nullableUuidField(input, "brandId", "brand_id");
    // A/S graduation: a closed deal can spawn its 판매 후 실행 follow-up project. The origin
    // deal id lives in meta so the project can point back at the sale that created it.
    const dealId = nullableUuidField(input, "dealId", "deal_id");
    const entityRef = projectEntityRef(input.entityRef ?? input.entity_ref);
    const orgScope = text(input.orgScope ?? input.org_scope, 30).toLowerCase();
    const status = text(input.status || "active", 30).toLowerCase();
    const priority = text(input.priority || "medium", 30).toLowerCase();
    const dueAt = dateTime(input.dueAt || input.due_at);
    const delivery = has(input, "delivery") ? parseDelivery(input.delivery) : null;
    if (has(input, "delivery") && !delivery) return { ok: false, reason: "invalid-delivery-plan" };
    if (delivery) {
      const issue = validateDelivery(delivery, dueAt.value);
      if (issue) return { ok: false, reason: issue };
      if (status === "completed") return { ok: false, reason: completionIssue(delivery) || "verify-prototype-first" };
    }
    const hasInitialProgress = has(input, "progress");
    const initialProgress = hasInitialProgress ? progress(input.progress) : null;

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!areaId) return { ok: false, reason: "invalid-area-id" };
    if (!title) return { ok: false, reason: "missing-title" };
    if (!brandId.ok) return { ok: false, reason: "invalid-brand-id" };
    if (!dealId.ok) return { ok: false, reason: "invalid-deal-id" };
    if (!entityRef.ok) return { ok: false, reason: "invalid-entity-ref" };
    if (!BRAND_ORG_SCOPES.has(orgScope)) return { ok: false, reason: "invalid-org-scope" };
    if (!PROJECT_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
    if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
    if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
    if (hasInitialProgress && initialProgress === null) {
      return { ok: false, reason: "invalid-progress" };
    }

    return {
      ok: true,
      action,
      table: "projects",
      record: {
        id,
        workspace_id: workspaceId,
        area_id: areaId,
        brand_id: brandId.value,
        lead_id: entityRef.leadId,
        customer_account_id: entityRef.customerAccountId,
        owner_id: ownerId,
        name: title,
        summary: nullableText(input.summary, 2000),
        status,
        priority,
        ...(hasInitialProgress ? { progress: initialProgress } : {}),
        next_action: nullableText(input.nextAction || input.next_action, 1000),
        due_at: dueAt.value,
        last_activity_at: now.value,
        meta: {
          source: text(input.source || "manual", 80),
          org_scope: orgScope,
          ...(dealId.value ? { origin_deal_id: dealId.value } : {}),
          ...(delivery ? { delivery: { ...delivery, originalDueAt: dueAt.value, history: [] } } : {}),
        },
      },
    };
  }

  if (action === "create_task") {
    const id = uuid(input.id);
    const projectId = nullableUuidField(input, "projectId", "project_id");
    // Deal-linked sub-task (공유 실행 척추): tasks can hang off a deal's sales checklist the
    // same way they hang off a project. Lives in meta (deals ↔ tasks has no FK column) — the
    // proven stage_detail pattern; operating-ledger reads it back as todo.dealId.
    const dealId = nullableUuidField(input, "dealId", "deal_id");
    const title = text(input.title, 300);
    const status = text(input.status || "todo", 30).toLowerCase();
    const priority = text(input.priority || "medium", 30).toLowerCase();
    const dueAt = dateTime(input.dueAt || input.due_at);
    const checklist = has(input, "checklist") ? taskChecklist(input.checklist) : null;
    if (has(input, "itemType") && !["task", "subproject", "milestone"].includes(String(input.itemType))) return { ok: false, reason: "invalid-item-type" };

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!title) return { ok: false, reason: "missing-title" };
    if (!projectId.ok) return { ok: false, reason: "invalid-project-id" };
    if (!dealId.ok) return { ok: false, reason: "invalid-deal-id" };
    if (!TASK_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
    if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
    if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
    if (checklist && !checklist.ok) return { ok: false, reason: checklist.reason };

    return {
      ok: true,
      action,
      table: "tasks",
      record: {
        id,
        workspace_id: workspaceId,
        project_id: projectId.value,
        owner_id: ownerId,
        title,
        status,
        priority,
        next_action: nullableText(input.nextAction || input.next_action, 1000),
        description: nullableText(input.description, 4000),
        due_at: dueAt.value,
        completed_at: status === "done" ? now.value : null,
        meta: {
          source: text(input.source || "manual", 80),
          ...(dealId.value ? { deal_id: dealId.value } : {}),
          ...(checklist?.ok ? { checklist: checklist.items } : {}),
          ...(has(input, "itemType") ? { item_type: input.itemType } : {}),
        },
      },
    };
  }

  if (action === "update_task") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };

    const filters: Array<[string, string]> = [["id", `eq.${id}`], ["workspace_id", `eq.${workspaceId}`]];
    if (has(input, "expectedUpdatedAt") || has(input, "expected_updated_at")) {
      const expected = text(input.expectedUpdatedAt ?? input.expected_updated_at, 100);
      if (!dateTime(expected).ok || !expected) return { ok: false, reason: "invalid-expected-updated-at" };
      // Preserve PostgreSQL microseconds exactly, as in the project write contract.
      filters.push(["updated_at", `eq.${expected}`]);
    }

    // Partial patch (same has()-gated shape as update_project below) — the existing
    // status-only completion path (Today board, checkbox toggle) keeps sending just
    // {id, status} and gets exactly the same {status, completed_at, updated_at} patch as
    // before. Title/priority/project/due are additive, for the 내 작업 detail drawer.
    const patch: Record<string, unknown> = {};
    if (has(input, "status")) {
      const status = text(input.status, 30).toLowerCase();
      if (!TASK_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
      patch.status = status;
      patch.completed_at = status === "done" ? now.value : null;
    }
    if (has(input, "title")) {
      const title = text(input.title, 300);
      if (!title) return { ok: false, reason: "missing-title" };
      patch.title = title;
    }
    if (has(input, "priority")) {
      const priority = text(input.priority, 30).toLowerCase();
      if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
      patch.priority = priority;
    }
    if (has(input, "projectId") || has(input, "project_id")) {
      const projectId = nullableUuidField(input, "projectId", "project_id");
      if (!projectId.ok) return { ok: false, reason: "invalid-project-id" };
      patch.project_id = projectId.value;
    }
    if (has(input, "dueAt") || has(input, "due_at")) {
      const dueAt = dateTime(input.dueAt || input.due_at);
      if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
      patch.due_at = dueAt.value;
    }
    if (has(input, "description")) {
      patch.description = nullableText(input.description, 4000);
    }
    if (has(input, "nextAction") || has(input, "next_action")) {
      patch.next_action = nullableText(input.nextAction ?? input.next_action, 1000);
    }
    if (has(input, "checklist")) {
      if (!filters.some(([key]) => key === "updated_at")) return { ok: false, reason: "missing-expected-updated-at" };
      const checklist = taskChecklist(input.checklist);
      if (!checklist.ok) return { ok: false, reason: checklist.reason };
      // The service merges this one owned key with the persisted metadata under the same version guard.
      patch.meta = { checklist: checklist.items };
    }

    if (has(input, "itemType")) {
      if (!["task", "subproject", "milestone"].includes(String(input.itemType))) return { ok: false, reason: "invalid-item-type" };
      if (!filters.some(([key]) => key === "updated_at")) return { ok: false, reason: "missing-expected-updated-at" };
      patch.meta = { ...(patch.meta as Record<string, unknown> || {}), item_type: input.itemType };
    }

    if (Object.keys(patch).length === 0) return { ok: false, reason: "empty-patch" };
    patch.updated_at = now.value;

    return {
      ok: true,
      action,
      table: "tasks",
      filters,
      patch,
    };
  }

  if (action === "update_project") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };
    if (has(input, "orgScope") || has(input, "org_scope")) {
      return { ok: false, reason: "unsupported-org-scope-update" };
    }

    const filters: Array<[string, string]> = [
      ["id", `eq.${id}`],
      ["workspace_id", `eq.${workspaceId}`],
    ];
    if (has(input, "expectedUpdatedAt") || has(input, "expected_updated_at")) {
      const rawExpected = text(input.expectedUpdatedAt ?? input.expected_updated_at, 100);
      const expectedUpdatedAt = dateTime(rawExpected);
      if (!expectedUpdatedAt.ok || !expectedUpdatedAt.value) {
        return { ok: false, reason: "invalid-expected-updated-at" };
      }
      // Filter on the raw string the client read back from Postgres, not the
      // Date→toISOString() re-format: toISOString() truncates Postgres's
      // microsecond precision (…52.676457+00:00 → …52.676Z), so the eq filter
      // never matched rows whose updated_at carries microseconds and every
      // optimistic-locked update 409'd as stale. dateTime() above still
      // validates that the string is a real timestamp.
      filters.push(["updated_at", `eq.${rawExpected}`]);
    }

    const patch: Record<string, unknown> = {};
    if (has(input, "areaId") || has(input, "area_id")) {
      const areaId = uuid(input.areaId ?? input.area_id);
      if (!areaId) return { ok: false, reason: "invalid-area-id" };
      patch.area_id = areaId;
    }
    if (has(input, "brandId") || has(input, "brand_id")) {
      const brandId = nullableUuidField(input, "brandId", "brand_id");
      if (!brandId.ok) return { ok: false, reason: "invalid-brand-id" };
      patch.brand_id = brandId.value;
    }
    if (has(input, "entityRef") || has(input, "entity_ref")) {
      const entityRef = projectEntityRef(input.entityRef ?? input.entity_ref);
      if (!entityRef.ok) return { ok: false, reason: "invalid-entity-ref" };
      patch.lead_id = entityRef.leadId;
      patch.customer_account_id = entityRef.customerAccountId;
    }
    if (has(input, "title") || has(input, "name")) {
      const title = text(input.title || input.name, 300);
      if (!title) return { ok: false, reason: "missing-title" };
      patch.name = title;
    }
    if (has(input, "summary")) patch.summary = nullableText(input.summary, 2000);
    if (has(input, "status")) {
      const status = text(input.status, 30).toLowerCase();
      if (!PROJECT_STATUSES.has(status)) return { ok: false, reason: "invalid-status" };
      patch.status = status;
      patch.completed_at = status === "completed" ? now.value : null;
    }
    if (has(input, "priority")) {
      const priority = text(input.priority, 30).toLowerCase();
      if (!PRIORITIES.has(priority)) return { ok: false, reason: "invalid-priority" };
      patch.priority = priority;
    }
    if (has(input, "progress")) {
      const normalizedProgress = progress(input.progress);
      if (normalizedProgress === null) return { ok: false, reason: "invalid-progress" };
      patch.progress = normalizedProgress;
    }
    if (has(input, "nextAction") || has(input, "next_action")) {
      patch.next_action = nullableText(input.nextAction || input.next_action, 1000);
    }
    if (has(input, "dueAt") || has(input, "due_at")) {
      const dueAt = dateTime(input.dueAt || input.due_at);
      if (!dueAt.ok) return { ok: false, reason: "invalid-due-at" };
      patch.due_at = dueAt.value;
    }

    if (has(input, "delivery")) {
      const delivery = parseDelivery(input.delivery);
      if (!delivery) return { ok: false, reason: "invalid-delivery-plan" };
      const issue = validateDelivery(delivery, patch.due_at);
      if (issue) return { ok: false, reason: issue };
      patch.meta = { delivery };
    }
    if (has(input, "deliveryEvent")) {
      if (!["start", "prototype", "pause", "resume"].includes(String(input.deliveryEvent))) return { ok: false, reason: "invalid-delivery-event" };
      // Server service resolves timestamps against the current row.
      patch.meta = patch.meta || {};
    }
    if (Object.keys(patch).length === 0) return { ok: false, reason: "empty-patch" };
    patch.last_activity_at = now.value;
    patch.updated_at = now.value;

    return {
      ok: true,
      action,
      table: "projects",
      filters,
      patch,
    };
  }

  if (action === "create_decision") {
    const id = uuid(input.id);
    const title = text(input.title, 300);
    const projectId = uuid(input.projectId || input.project_id);
    const rationale = nullableText(input.rationale, 4000);
    const decidedAt = dateTime(input.decidedAt || input.decided_at);
    const summary = text(input.summary, 2000) || text(input.rationale, 2000) || title;

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!title) return { ok: false, reason: "missing-title" };
    if (!decidedAt.ok) return { ok: false, reason: "invalid-decided-at" };

    return {
      ok: true,
      action,
      table: "decisions",
      record: {
        id,
        workspace_id: workspaceId,
        project_id: projectId,
        actor_id: ownerId,
        title,
        summary,
        rationale,
        decided_at: decidedAt.value,
        meta: { source: text(input.source || "manual", 80) },
      },
    };
  }

  if (action === "update_decision") {
    const id = uuid(input.id);
    if (!id) return { ok: false, reason: "invalid-id" };

    const patch: Record<string, unknown> = {};
    if (has(input, "title")) {
      const title = text(input.title, 300);
      if (!title) return { ok: false, reason: "missing-title" };
      patch.title = title;
    }
    if (has(input, "projectId") || has(input, "project_id")) {
      patch.project_id = uuid(input.projectId ?? input.project_id);
    }
    if (has(input, "rationale")) {
      patch.rationale = nullableText(input.rationale, 4000);
    }
    if (has(input, "decidedAt") || has(input, "decided_at")) {
      const decidedAt = dateTime(input.decidedAt ?? input.decided_at);
      if (!decidedAt.ok) return { ok: false, reason: "invalid-decided-at" };
      patch.decided_at = decidedAt.value;
    }

    if (Object.keys(patch).length === 0) return { ok: false, reason: "empty-patch" };
    patch.updated_at = now.value;

    return {
      ok: true,
      action,
      table: "decisions",
      filters: [
        ["id", `eq.${id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ],
      patch,
    };
  }

  if (action === "create_brand") {
    const id = uuid(input.id);
    const name = text(input.name || input.title, 200);
    const slug = text(input.slug, 120).toLowerCase();
    const category = text(input.category, 30).toLowerCase();
    const orgScope = text(input.orgScope || input.org_scope, 30).toLowerCase();
    const glyph = text(input.glyph, 8);

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!name) return { ok: false, reason: "missing-name" };
    if (!slug) return { ok: false, reason: "missing-slug" };
    if (!BRAND_CATEGORIES.has(category)) return { ok: false, reason: "invalid-category" };
    if (!BRAND_ORG_SCOPES.has(orgScope)) return { ok: false, reason: "invalid-org-scope" };

    return {
      ok: true,
      action,
      table: "brands",
      record: {
        id,
        workspace_id: workspaceId,
        slug,
        name,
        kind: "brand",
        // resolveBrandCategory / resolveBrandOrgScope in the Hub's operating-ledger
        // read these meta keys back; glyph is optional (falls back to canonical/index).
        meta: {
          category,
          org_scope: orgScope,
          source: text(input.source || "hub-projects", 80),
          ...(glyph ? { glyph } : {}),
        },
      },
    };
  }

  if (action === "update_brand_identity") {
    const id = uuid(input.id);
    const expected = dateTime(input.expectedUpdatedAt);
    if (!id) return { ok: false, reason: "invalid-id" };
    if (!expected.ok || !expected.value) return { ok: false, reason: "missing-brand-version" };
    if (!input.identity || typeof input.identity !== "object" || Array.isArray(input.identity)) return { ok: false, reason: "invalid-identity" };
    const identity = input.identity as Record<string, unknown>;
    const meta: Record<string, unknown> = {};
    const textFields: Record<string, string> = { audience: "audience", promise: "promise", philosophy: "philosophy", direction: "direction", offer: "offer", voice: "voice", voiceExamples: "voice_examples", currentFocus: "current_focus" };
    for (const [key, column] of Object.entries(textFields)) {
      if (typeof identity[key] !== "string" || String(identity[key]).length > 4000) return { ok: false, reason: `invalid-identity-${key}` };
      meta[column] = text(identity[key], 4000);
    }
    for (const [key, column] of Object.entries({ keywords: "keywords", rules: "content_rules", forbidden: "forbidden_terms" })) {
      const value = identity[key];
      if (!Array.isArray(value) || value.length > 50 || value.some((entry) => typeof entry !== "string" || entry.length > 1000)) return { ok: false, reason: `invalid-identity-${key}` };
      meta[column] = value.map((entry) => entry.trim()).filter(Boolean);
    }
    if (!["", "active", "experimenting", "resting"].includes(String(input.operatingState))) return { ok: false, reason: "invalid-operating-state" };
    if (typeof input.isFocused !== "boolean" || typeof input.confirmIdentity !== "boolean") return { ok: false, reason: "invalid-identity-confirmation" };
    meta.operating_state = input.operatingState;
    meta.is_focused = input.isFocused;
    // Editing always needs a fresh, explicit operator confirmation.
    meta.identity_confirmed_at = input.confirmIdentity ? now.value : null;
    return { ok: true, action, table: "brands",
      filters: [["id", `eq.${id}`], ["workspace_id", `eq.${workspaceId}`], ["updated_at", `eq.${text(input.expectedUpdatedAt, 100)}`]],
      patch: { meta, updated_at: now.value } };
  }

  if (action === "update_brand") {
    const id = uuid(input.id);
    const name = text(input.name || input.title, 200);
    const category = text(input.category, 30).toLowerCase();
    const orgScope = text(input.orgScope || input.org_scope, 30).toLowerCase();
    const glyph = text(input.glyph, 8);

    if (!id) return { ok: false, reason: "invalid-id" };
    if (!name) return { ok: false, reason: "missing-name" };
    if (!BRAND_CATEGORIES.has(category)) return { ok: false, reason: "invalid-category" };
    if (!BRAND_ORG_SCOPES.has(orgScope)) return { ok: false, reason: "invalid-org-scope" };

    return {
      ok: true,
      action,
      table: "brands",
      filters: [
        ["id", `eq.${id}`],
        ["workspace_id", `eq.${workspaceId}`],
      ],
      // slug은 받지 않는다 — 브랜드 key(필터·폴더 그룹 식별자)라 편집으로 바뀌면 안 된다.
      // 서비스가 현재 meta와 병합하고 버전을 비교하므로 브랜드 기준은 보존된다.
      patch: {
        name,
        meta: {
          category,
          org_scope: orgScope,
          source: text(input.source || "hub-projects", 80),
          ...(glyph ? { glyph } : {}),
        },
      },
    };
  }

  return { ok: false, reason: "invalid-action" };
}
