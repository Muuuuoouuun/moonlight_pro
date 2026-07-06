"use client";

// Intake Inbox — per-row review surface for lead_intake_raw staging rows.
//
// The sheets-sync page only shows aggregate counts (pending/promoted/merged/review);
// once a row lands in 'review' or gets rejected it becomes invisible. This page lets
// the operator see every staged row (business_card + google_sheets), inspect its
// normalized fields, and promote/reject/edit it individually.

import React from "react";
import { Badge, Button, Card, Dot, EmptyState, IconButton, Input, SectionTitle } from "../hub-primitives";

const SOURCE_TONE = { business_card: "moon", google_sheets: "info" };
const SOURCE_LABEL = { business_card: "명함", google_sheets: "시트" };

const STATUS_TONE = { pending: "neutral", review: "warning", promoted: "success", merged: "success", ignored: "danger" };
const STATUS_LABEL = { pending: "대기", review: "검토", promoted: "승격됨", merged: "승격됨", ignored: "거절" };

const STATUS_FILTERS = [
  { key: "all", label: "전체" },
  { key: "pending", label: "대기" },
  { key: "review", label: "검토" },
  { key: "promoted", label: "승격됨" }, // matches both promoted + merged rows client-side
  { key: "ignored", label: "거절" },
];

const SOURCE_FILTERS = [
  { key: "all", label: "전체" },
  { key: "business_card", label: "명함" },
  { key: "google_sheets", label: "시트" },
];

const ROW_GRID = "70px 1fr 150px 160px 90px 1fr 80px 160px";

function SyncBadge({ state }) {
  const label = state === "live" ? "live" : state === "loading" ? "loading" : "mock";
  const color = state === "live" ? "var(--success)" : state === "loading" ? "var(--warning)" : "var(--fg-faint)";
  return <span className="mono" style={{ marginLeft: 8, fontSize: 10.5, color }}>{label}</span>;
}

// Fetch helper mirroring saveRevenueRecord in revenue.jsx: returns { ok, status, row/result }.
async function postIntakeOp(body) {
  try {
    const resp = await fetch("/api/hub/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.status === "saved", status: data.status || "error", data };
  } catch (err) {
    return { ok: false, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

function EditRow({ row, onCancel, onSaved }) {
  const [fields, setFields] = React.useState({
    name: row.name || "",
    contactName: row.contactName || "",
    phone: row.phone || "",
    email: row.email || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await postIntakeOp({
      op: "update",
      id: row.id,
      normalized: {
        name: fields.name.trim() || null,
        contact_name: fields.contactName.trim() || null,
        phone: fields.phone.trim() || null,
        email: fields.email.trim() || null,
      },
    });
    setSaving(false);
    if (r.ok || r.status === "preview") {
      onSaved(r.data?.row || null);
    } else {
      setError("저장 실패 — 다시 시도하세요.");
    }
  };

  return (
    <div style={{
      gridColumn: "1 / -1",
      padding: "10px 16px 14px",
      background: "var(--surface-2)",
      borderTop: "1px solid var(--line-soft)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <Input placeholder="기관명" value={fields.name} onChange={(v) => setFields((f) => ({ ...f, name: v }))} />
        <Input placeholder="담당자" value={fields.contactName} onChange={(v) => setFields((f) => ({ ...f, contactName: v }))} />
        <Input placeholder="전화" value={fields.phone} onChange={(v) => setFields((f) => ({ ...f, phone: v }))} />
        <Input placeholder="이메일" value={fields.email} onChange={(v) => setFields((f) => ({ ...f, email: v }))} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Button variant="primary" size="xs" icon="check" onClick={save} disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
        <Button variant="ghost" size="xs" onClick={onCancel}>취소</Button>
        {error && <span style={{ fontSize: 11.5, color: "var(--danger)" }}>{error}</span>}
      </div>
    </div>
  );
}

export function IntakeInbox() {
  const [syncState, setSyncState] = React.useState("loading"); // loading | live | mock
  const [rows, setRows] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [busyId, setBusyId] = React.useState(null);
  const [errorId, setErrorId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);

  const load = React.useCallback(async () => {
    setSyncState((s) => (s === "live" ? s : "loading"));
    try {
      const r = await fetch("/api/hub/intake", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) {
        setSyncState("mock");
        return;
      }
      setSyncState(d.status === "live" ? "live" : "mock");
      setRows(Array.isArray(d.rows) ? d.rows : []);
    } catch {
      setSyncState("mock");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const counts = React.useMemo(() => {
    const c = { pending: 0, review: 0, promoted: 0, ignored: 0 };
    rows.forEach((r) => {
      if (r.status === "promoted" || r.status === "merged") c.promoted += 1;
      else if (c[r.status] != null) c[r.status] += 1;
    });
    return c;
  }, [rows]);

  const filtered = rows.filter((r) => {
    const statusOk =
      statusFilter === "all" ? true :
      statusFilter === "promoted" ? (r.status === "promoted" || r.status === "merged") :
      r.status === statusFilter;
    const sourceOk = sourceFilter === "all" || r.source === sourceFilter;
    return statusOk && sourceOk;
  });

  const patchRow = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const promote = async (row) => {
    setBusyId(row.id);
    setErrorId(null);
    const prevStatus = row.status;
    patchRow(row.id, { status: "promoted" }); // optimistic
    const r = await postIntakeOp({ op: "promote", id: row.id });
    setBusyId(null);
    if (!r.ok) {
      patchRow(row.id, { status: prevStatus });
      setErrorId(row.id);
    } else {
      load(); // pick up lead_id/company_id/promoted_at from the server
    }
  };

  const reject = async (row) => {
    setBusyId(row.id);
    setErrorId(null);
    const prevStatus = row.status;
    patchRow(row.id, { status: "ignored" }); // optimistic
    const r = await postIntakeOp({ op: "reject", id: row.id });
    setBusyId(null);
    if (!r.ok && r.status !== "preview") {
      patchRow(row.id, { status: prevStatus });
      setErrorId(row.id);
    } else if (r.data?.row) {
      patchRow(row.id, r.data.row);
    }
  };

  const onEditSaved = (id, savedRow) => {
    if (savedRow) patchRow(id, savedRow);
    else patchRow(id, { status: "pending" }); // preview mode — still flips to promotable
    setEditingId(null);
  };

  const total = rows.length;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1200 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>리드 인박스</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {total}건 · 대기 {counts.pending} · 검토 {counts.review} · 승격됨 {counts.promoted} · 거절 {counts.ignored}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="search" onClick={load}>새로고침</Button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="hub-toolbar" style={{ display: "flex", gap: 2, background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: 2 }}>
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
              padding: "4px 10px", fontSize: 11.5, borderRadius: 4,
              color: statusFilter === f.key ? "var(--fg)" : "var(--fg-faint)",
              background: statusFilter === f.key ? "var(--surface-3)" : "transparent",
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="hub-toolbar" style={{ display: "flex", gap: 2, background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: 2 }}>
          {SOURCE_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setSourceFilter(f.key)} style={{
              padding: "4px 10px", fontSize: 11.5, borderRadius: 4,
              color: sourceFilter === f.key ? "var(--fg)" : "var(--fg-faint)",
              background: sourceFilter === f.key ? "var(--surface-3)" : "transparent",
            }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <SectionTitle>스테이징 레코드</SectionTitle>
      <Card pad={false} className="hub-table-card">
        {filtered.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={syncState === "live" ? "lead_intake_raw에 대기 중인 레코드가 없습니다" : "Supabase 미연결"}
            description={
              syncState === "live"
                ? "명함 촬영 또는 시트 동기화로 새 리드가 들어오면 여기에 표시됩니다."
                : "Supabase 환경변수가 설정되지 않아 실데이터를 불러올 수 없습니다. 연결 후 새로고침하세요."
            }
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: ROW_GRID, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", fontSize: 11, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <span>Source</span><span>Name</span><span>Contact</span><span>Phone / Email</span><span>Status</span><span>Note</span><span></span><span style={{ textAlign: "right" }}>Created</span>
            </div>
            {filtered.map((row, i) => {
              const isLast = i === filtered.length - 1;
              const canAct = row.status === "pending" || row.status === "review";
              const isEditing = editingId === row.id;
              return (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: isEditing ? "1fr" : ROW_GRID }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: ROW_GRID, gap: 12,
                    padding: "12px 16px", alignItems: "center",
                    borderBottom: isLast && !isEditing ? "none" : "1px solid var(--line-soft)",
                  }}>
                    <span>
                      <Badge tone={SOURCE_TONE[row.source] || "neutral"} size="xs">{SOURCE_LABEL[row.source] || row.source}</Badge>
                    </span>
                    <div style={{ minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.name || "이름미상"}
                    </div>
                    <div style={{ minWidth: 0, fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.contactName || "—"}{row.title ? ` · ${row.title}` : ""}
                    </div>
                    <div className="mono" style={{ minWidth: 0, fontSize: 11.5, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.phone || "—"}{row.email ? ` · ${row.email}` : ""}
                    </div>
                    <span>
                      <Badge tone={STATUS_TONE[row.status] || "neutral"} size="xs" variant="outline">{STATUS_LABEL[row.status] || row.status}</Badge>
                    </span>
                    <div style={{ minWidth: 0, fontSize: 11.5, color: "var(--fg-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.note || "—"}
                    </div>
                    <span>
                      {row.status === "review" && (
                        <IconButton icon="edit" tooltip="수정" onClick={() => setEditingId(isEditing ? null : row.id)} />
                      )}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      {canAct ? (
                        <>
                          <Button variant="primary" size="xs" icon="check" onClick={() => promote(row)} disabled={busyId === row.id}>승격</Button>
                          <Button variant="ghost" size="xs" icon="x" style={{ color: "var(--danger)" }} onClick={() => reject(row)} disabled={busyId === row.id}>거절</Button>
                        </>
                      ) : (
                        <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>{row.at}</span>
                      )}
                    </div>
                  </div>
                  {canAct && (
                    <div className="mono" style={{ display: isEditing ? "none" : "flex", justifyContent: "flex-end", padding: "0 16px 6px", fontSize: 10.5, color: "var(--fg-faint)" }}>
                      {row.at}
                    </div>
                  )}
                  {errorId === row.id && (
                    <div style={{ padding: "0 16px 8px", fontSize: 11.5, color: "var(--danger)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Dot tone="danger" />저장 실패 — 네트워크 또는 서버 상태를 확인하세요.
                    </div>
                  )}
                  {isEditing && (
                    <EditRow
                      row={row}
                      onCancel={() => setEditingId(null)}
                      onSaved={(savedRow) => onEditSaved(row.id, savedRow)}
                    />
                  )}
                </div>
              );
            })}
          </>
        )}
      </Card>
    </div>
  );
}
