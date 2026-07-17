"use client";

import React from "react";
import { Avatar, Badge, Button, IconButton } from "../hub-primitives";

function DetailSection({ title, count = 0, empty, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 8, display: "flex", alignItems: "center" }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{count}</span>
      </div>
      {count > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      ) : (
        <div style={{ padding: "10px 11px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", color: "var(--fg-faint)", fontSize: 11.5 }}>
          {empty}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ title, body, meta, badge, tone = "neutral" }) {
  return (
    <div style={{ padding: "9px 10px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {badge && <Badge tone={tone} size="xs">{badge}</Badge>}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.2, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {meta && <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>{meta}</span>}
      </div>
      {body && <div style={{ marginTop: 5, color: "var(--fg-muted)", fontSize: 11.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{body}</div>}
    </div>
  );
}

function progressLabel(project) {
  const progress = project.displayProgress;
  if (!progress) return "진척 데이터 없음";
  const count = progress.done !== null && progress.total !== null
    ? ` · ${progress.done}/${progress.total}`
    : "";
  return `${progress.value === null ? "" : `${progress.value}% · `}${progress.label}${count}`;
}

export function ProjectDetailPanel({
  project,
  container,
  todos = [],
  updates = [],
  decisions = [],
  notes = [],
  checks = [],
  syncState,
  statusTone = {},
  updateTone = {},
  checkTone = {},
  orderPending = false,
  orderResult = null,
  onClose,
  onEdit,
  onToggleTodo,
  onCreateTodo,
  onOpen,
  onSendOrder,
}) {
  if (!project) return null;
  const doneCount = todos.filter((todo) => todo.done).length;
  const displaySummary = project.displaySummary || project.summary || "";
  const displayNextAction = project.displayNextAction || project.nextAction || "";

  return (
    <aside aria-label={`${project.name} 상세`} style={{ borderLeft: "1px solid var(--line-soft)", background: "var(--surface)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, color: "var(--fg-muted)" }}>{container?.glyph}</span>
        <div style={{ fontSize: 11, color: "var(--fg-faint)", flex: 1 }}>{container?.name || "저장 위치 미정"}</div>
        <IconButton icon="x" size={22} iconSize={12} tooltip="상세 닫기" onClick={onClose} />
      </div>
      <div className="scroll-y" style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>{project.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <Badge tone={statusTone[project.status]} size="xs">{project.status}</Badge>
            {project.tag === "company" && <Badge tone="company" size="xs">Company</Badge>}
            {project.tag === "personal" && <Badge tone="personal" size="xs">Personal</Badge>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", rowGap: 9, fontSize: 12 }}>
          <span style={{ color: "var(--fg-faint)" }}>Owner</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Avatar name={project.owner} size={18} tone={project.owner === "Me" ? "moon" : "neutral"} />
            {project.owner}
          </span>
          <span style={{ color: "var(--fg-faint)" }}>기한</span>
          <span className="mono" style={{ color: "var(--fg)" }}>{project.due}</span>
          <span style={{ color: "var(--fg-faint)" }}>진행률</span>
          <span style={{ color: "var(--fg-muted)" }}>{progressLabel(project)}</span>
          <span style={{ color: "var(--fg-faint)" }}>최근 활동</span>
          <span className="mono" style={{ color: "var(--fg-muted)" }}>{project.lastActivityLabel || "미정"}</span>
          <span style={{ color: "var(--fg-faint)" }}>다음 행동</span>
          <span style={{ color: "var(--fg-muted)", whiteSpace: "pre-wrap" }}>{displayNextAction || "아직 지정되지 않음"}</span>
          <span style={{ color: "var(--fg-faint)" }}>생성</span>
          <span className="mono" style={{ color: "var(--fg-muted)" }}>{project.createdAtLabel || "미정"}</span>
        </div>
        <div>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 6 }}>목표 결과</div>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {displaySummary || `${container?.desc || "프로젝트"}. 아직 목표 결과가 기록되지 않았습니다.`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 8 }}>
            체크리스트 · {doneCount}/{todos.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {todos.map((todo) => (
              <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)", border: "1px solid var(--line-soft)" }}>
                <button onClick={() => onToggleTodo?.(todo.id)} style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${todo.done ? "var(--success)" : "var(--line-strong)"}`, background: todo.done ? "var(--success)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {todo.done && <span style={{ fontSize: 9, color: "var(--bg)" }}>✓</span>}
                </button>
                <span style={{ flex: 1, fontSize: 12, textDecoration: todo.done ? "line-through" : "none", color: todo.done ? "var(--fg-faint)" : "var(--fg)" }}>{todo.title}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{todo.due}</span>
              </div>
            ))}
            <button onClick={() => onCreateTodo?.(project.id)} style={{ padding: "6px 8px", textAlign: "left", fontSize: 11.5, color: "var(--fg-faint)" }}>＋ 항목 추가</button>
          </div>
        </div>
        <DetailSection title="최근 업데이트" count={updates.length} empty={syncState === "live" ? "이 프로젝트에 연결된 update가 아직 없습니다." : "live 연결 후 project_updates가 여기에 표시됩니다."}>
          {updates.map((update) => <ActivityRow key={update.id} title={update.title} body={update.summary || update.nextAction} meta={update.progress !== null && update.progress !== undefined ? `${update.progress}%` : update.happenedAtLabel} badge={update.source} tone={updateTone[update.status] || "neutral"} />)}
        </DetailSection>
        <DetailSection title="결정" count={decisions.length} empty="이 프로젝트에 연결된 결정 기록이 없습니다.">
          {decisions.map((decision) => <ActivityRow key={decision.id} title={decision.title} body={decision.summary} meta={decision.decidedAtLabel} badge="decision" tone="moon" />)}
        </DetailSection>
        <DetailSection title="노트" count={notes.length} empty="이 프로젝트에 연결된 노트가 없습니다.">
          {notes.map((note) => <ActivityRow key={note.id} title={note.title} body={note.body} meta={note.createdAtLabel} badge="note" />)}
        </DetailSection>
        <DetailSection title="루틴 체크" count={checks.length} empty="이 프로젝트에 연결된 routine check가 없습니다.">
          {checks.map((check) => <ActivityRow key={check.id} title={check.checkType} body={check.note} meta={check.checkedAtLabel} badge={check.status} tone={checkTone[check.status] || "neutral"} />)}
        </DetailSection>
      </div>
      <div style={{ padding: 12, borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 6 }}>
        <Button variant="outline" size="sm" onClick={() => onEdit?.(project)}>편집</Button>
        <Button variant="primary" size="sm" icon="chat" style={{ flex: 1 }} onClick={() => onOpen?.(project)}>열기</Button>
        <Button variant="outline" size="sm" icon="orders" onClick={() => onSendOrder?.(project)}>{orderPending ? "Sending…" : "주문 보내기"}</Button>
        {orderResult && !orderPending && <span className="mono" style={{ fontSize: 10.5, color: orderResult.tone === "ok" ? "var(--success)" : "var(--danger)", whiteSpace: "nowrap" }}>{orderResult.label}</span>}
      </div>
    </aside>
  );
}
