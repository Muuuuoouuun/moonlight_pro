import { createHash } from "node:crypto";

type Row = Record<string, any>;
type Dependencies = {
  read: (table: string, options: any) => Promise<Row[] | null>;
  insert: (
    table: string,
    row: Row,
  ) => Promise<{ persisted: boolean; reason?: string }>;
};
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const stableId = (value: string) => {
  const h = digest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// Immutable capture: original text is never trimmed, interpreted as HTML, or overwritten.
export function normalizeMemoCapture(input: Row, workspaceId: unknown) {
  if (!uuid(workspaceId) || !uuid(input.id))
    return { ok: false as const, error: "invalid-identity" };
  const body = input.body;
  if (
    typeof body !== "string" ||
    !body.trim() ||
    body.length > 100000 ||
    body.includes("\0")
  )
    return { ok: false as const, error: "invalid-body" };
  if (!["personal", "company"].includes(input.scope))
    return { ok: false as const, error: "invalid-scope" };
  if (
    input.title !== undefined &&
    (typeof input.title !== "string" || input.title.length > 300)
  )
    return { ok: false as const, error: "invalid-title" };
  if (
    !Array.isArray(input.labels) ||
    input.labels.length > 12 ||
    input.labels.some(
      (v: unknown) => typeof v !== "string" || !v.trim() || v.length > 40,
    )
  )
    return { ok: false as const, error: "invalid-labels" };
  const labels = [
    ...new Set(input.labels.map((v: string) => v.trim().normalize("NFC"))),
  ].sort();
  const source = input.source || { type: "manual" };
  if (!["manual", "file"].includes(source.type))
    return { ok: false as const, error: "invalid-source" };
  if (
    source.type === "file" &&
    (typeof source.name !== "string" ||
      source.name.length > 240 ||
      !/\.(txt|md)$/i.test(source.name) ||
      /[\\/\0]/.test(source.name))
  )
    return { ok: false as const, error: "invalid-file-name" };
  const modified =
    source.modifiedAt == null ? null : new Date(source.modifiedAt);
  if (modified && Number.isNaN(modified.getTime()))
    return { ok: false as const, error: "invalid-file-date" };
  const original = source.type === "file" ? source.originalBody : body;
  if (
    typeof original !== "string" ||
    !original.trim() ||
    original.length > 100000 ||
    original.includes("\0")
  )
    return { ok: false as const, error: "invalid-original" };
  const title =
    input.title?.trim() ||
    body
      .split(/\r?\n/)
      .find((s: string) => s.trim())
      ?.trim()
      .slice(0, 100) ||
    "새 메모";
  const origin = {
    type: source.type,
    name: source.type === "file" ? source.name : null,
    fileModifiedAt: modified?.toISOString() || null,
  };
  const hash = digest(body);
  // Same named file + same original + same working body in the same scope = same capture.
  // A revised file becomes a new snapshot; metadata disagreement is an explicit conflict.
  const id =
    source.type === "file"
      ? stableId(
          JSON.stringify([
            workspaceId,
            input.scope,
            source.name,
            original,
            body,
          ]),
        )
      : input.id;
  const payloadHash = digest(
    JSON.stringify({
      title,
      body,
      scope: input.scope,
      labels,
      origin: { type: origin.type, name: origin.name },
      original,
    }),
  );
  return {
    ok: true as const,
    row: {
      id,
      workspace_id: workspaceId,
      title,
      body,
      meta: {
        memo_capture: {
          version: 1,
          scope: input.scope,
          labels,
          labelSource: "operator",
          source: origin,
          originalBody: original,
          contentHash: hash,
          originalHash: digest(original),
          payloadHash,
          // AI-derived labels/analysis belong in a separate, versioned artifact later.
          analysis: null,
        },
      },
    },
  };
}

export async function executeMemoCapture(
  input: Row,
  workspaceId: unknown,
  deps: Dependencies,
) {
  const command = normalizeMemoCapture(input, workspaceId);
  if (!command.ok) return { status: "invalid-input", error: command.error };
  const row = command.row;
  const read = () =>
    deps.read("notes", {
      filters: [
        ["workspace_id", `eq.${workspaceId}`],
        ["id", `eq.${row.id}`],
      ],
      limit: 1,
    });
  const receipt = (existing: Row) =>
    existing.meta?.memo_capture?.payloadHash ===
    row.meta.memo_capture.payloadHash
      ? { status: "duplicate", id: row.id }
      : {
          status: "conflict",
          id: row.id,
          error: "memo-already-exists-with-different-content",
        };
  const current = await read();
  if (!current) return { status: "error", error: "memo-read-failed" };
  if (current.length) return receipt(current[0]);
  const saved = await deps.insert("notes", row);
  if (saved.persisted) return { status: "saved", id: row.id };
  // A concurrent insert or a lost acknowledgement can only succeed after exact re-read.
  const after = await read();
  if (after?.length) return receipt(after[0]);
  return {
    status: saved.reason === "missing-config" ? "preview" : "error",
    error: "memo-not-saved",
    retryable: true,
  };
}
