"use client";

import React from "react";
import { Button, Drawer, Checkbox } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { dayKey, deliveryDraft, deliveryAssessment, completionIssue, validateDelivery, safeResultUrl } from "../../../../../packages/project-delivery/index.ts";
import styles from "./project-delivery.module.css";

const dateLabel = (value) => dayKey(value)?.replaceAll("-", ".") || "미정";

export function ProjectDeliverySummary({ project, onManage, compact = false }) {
  const plan = deliveryDraft(project.delivery || {});
  const assessment = deliveryAssessment(plan, { dueAt: project.dueAt, completed: project.statusKey === "completed" && Boolean(project.delivery?.prototypeVerifiedAt), prototypeVerifiedAt: project.delivery?.prototypeVerifiedAt, paused: project.statusKey === "blocked" && Boolean(project.delivery?.pausedAt) });
  const count = plan.criteria.filter((item) => item.done).length;
  return (
    <section className={styles.summary} data-compact={compact} aria-label="프로젝트 마무리 계획">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>이번에 남길 결과물</span><h3>{plan.deliverable || "완성할 최소 결과물을 정하세요"}</h3></div>
        <Button variant="outline" size="sm" onClick={() => onManage?.(project)}>계획·검증</Button>
      </div>
      <ol className={styles.timeline}>
        {[
          ["착수", plan.plannedStart, project.startedAt],
          ["프로토타입 확인", plan.prototypeDate, project.delivery?.prototypeVerifiedAt],
          ["종료", project.dueAt, project.completedAt],
        ].map(([label, planned, actual], index) => (
          <li key={label} data-done={Boolean(actual)}>
            <span className={styles.marker}>{actual ? <Iconed name="check" size={13} /> : `0${index + 1}`}</span>
            <span>{label}</span><strong className="mono">{dateLabel(planned)}</strong>
            <small>{actual ? `실제 ${dateLabel(actual)}` : "예정"}</small>
          </li>
        ))}
      </ol>
      <div className={styles.assessment} data-state={assessment.key}>
        <strong><Iconed name={assessment.key === "difficult" ? "flag" : "clock"} size={14} />마무리 가능성 · {assessment.label}</strong>
        <p>{assessment.reason}</p>
        <div className={styles.meta}><span>완료 조건 {plan.criteria.length ? `${count}/${plan.criteria.length}` : "미정"}</span>{plan.nextAction && <span>다음 · {plan.nextAction}</span>}</div>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export function ProjectDeliveryEditor({ project, onClose, onSave }) {
  const [base, setBase] = React.useState(project);
  const [plan, setPlan] = React.useState(() => deliveryDraft(project.delivery || {}));
  const [dueAt, setDueAt] = React.useState(dayKey(project.dueAt));
  const [scheduleReason, setScheduleReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState(false);
  const [discard, setDiscard] = React.useState(false);
  const [conflict, setConflict] = React.useState(null);
  const busyRef = React.useRef(false);
  const titleRef = React.useRef(null);
  const formId = React.useId();
  const dirty = JSON.stringify(plan) !== JSON.stringify(deliveryDraft(base.delivery || {})) || dueAt !== dayKey(base.dueAt);
  const terminal = base.statusKey === "completed" || base.statusKey === "archived";
  const update = (field, value) => { setPlan((current) => ({ ...current, [field]: value })); setMessage(""); };
  const assessment = deliveryAssessment(plan, { dueAt, prototypeVerifiedAt: base.delivery?.prototypeVerifiedAt, completed: base.statusKey === "completed", paused: base.statusKey === "blocked" && Boolean(base.delivery?.pausedAt) });
  const close = () => { if (busyRef.current) return; if (dirty) { setDiscard(true); return; } onClose(); };

  async function save(event) {
    if (busyRef.current || conflict) return;
    const issue = validateDelivery(plan, dueAt);
    if (issue) { setError(true); setMessage(issue); return; }
    if (event === "complete") {
      const issue = completionIssue(plan, base.delivery?.prototypeVerifiedAt);
      if (issue) { setError(true); setMessage(issue); return; }
    }
    busyRef.current = true; setBusy(true); setError(false); setMessage("저장 중…");
    try {
      const result = await onSave(base, { delivery: plan, dueAt, scheduleReason,
        ...(event === "complete" ? { status: "completed" } : event ? { deliveryEvent: event } : {}) });
      if (!result.ok) {
        setError(true); setMessage(result.message || result.error || "저장하지 못했습니다. 입력을 유지했습니다.");
        if (result.status === "conflict" && result.project) setConflict(result.project);
        return;
      }
      const row = result.project;
      const next = { ...base, delivery: row.meta?.delivery ?? row.delivery, dueAt: row.due_at ?? row.dueAt ?? null,
        startedAt: row.started_at ?? row.startedAt, completedAt: row.completed_at ?? row.completedAt,
        statusKey: row.statusKey ?? row.status, updatedAt: row.updated_at ?? row.updatedAt };
      setBase(next); setPlan(deliveryDraft(next.delivery)); setDueAt(dayKey(next.dueAt)); setScheduleReason("");
      setMessage(result.message || (event === "complete" ? "결과물과 검증 기록을 남기고 완료했습니다." : "저장했습니다."));
    } catch { setError(true); setMessage("연결을 확인한 뒤 다시 저장하세요. 입력은 유지했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <Drawer title="완성까지의 계획" subtitle={project.name} onClose={close} initialFocusRef={titleRef} width="min(640px, 100vw)"
      footerStyle={{ flexWrap: "wrap", gap: 8 }}
      footer={<>
        <div role={error ? "alert" : "status"} aria-live="polite" className={styles.feedback} data-error={error}>{message}</div>
        {discard ? <><span>저장하지 않은 변경이 있습니다.</span><Button variant="ghost" onClick={() => setDiscard(false)}>계속 편집</Button><Button variant="danger" onClick={onClose}>버리고 닫기</Button></> : <>
          <Button variant="ghost" onClick={close} disabled={busy}>닫기</Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy || Boolean(conflict)}>{busy ? "저장 중…" : "계획 저장"}</Button>
        </>}
      </>}>
      <form id={formId} className={styles.editor} onSubmit={(event) => { event.preventDefault(); save(); }}>
        <fieldset disabled={busy} className={styles.fields}>
        {conflict && <div className={styles.conflict} role="alert">
          <strong>다른 화면에서 프로젝트가 변경됐습니다.</strong>
          <p>내 입력은 유지했습니다. 최신 기록을 확인한 뒤 반영하세요.</p>
          <p>최신 결과물: {conflict.meta?.delivery?.deliverable || "미정"} · 종료일: {dateLabel(conflict.due_at)}</p>
          <Button variant="outline" onClick={() => { setBase({ ...base, delivery: conflict.meta?.delivery, dueAt: conflict.due_at, startedAt: conflict.started_at, completedAt: conflict.completed_at, statusKey: conflict.status, updatedAt: conflict.updated_at }); setConflict(null); setMessage("최신 기록을 기준으로 내 입력을 다시 저장할 수 있습니다."); }}>내 입력으로 다시 검토</Button>
          <Button variant="ghost" onClick={() => { const next = { ...base, delivery: conflict.meta?.delivery, dueAt: conflict.due_at, startedAt: conflict.started_at, completedAt: conflict.completed_at, statusKey: conflict.status, updatedAt: conflict.updated_at }; setBase(next); setPlan(deliveryDraft(next.delivery)); setDueAt(dayKey(next.dueAt)); setConflict(null); setMessage(""); }}>최신 기록 불러오기</Button>
        </div>}
        <Field label="이번에 남길 최소 결과물"><textarea ref={titleRef} rows={2} maxLength={2000} value={plan.deliverable} onChange={(e) => update("deliverable", e.target.value)} placeholder="예: 미팅 기록을 저장하고 다시 볼 수 있는 프로토타입" /></Field>
        <div className={styles.dateGrid}>
          <Field label="착수 예정일"><input type="date" value={plan.plannedStart} onChange={(e) => update("plannedStart", e.target.value)} /></Field>
          <Field label="프로토타입 확인일"><input type="date" value={plan.prototypeDate} onChange={(e) => update("prototypeDate", e.target.value)} /></Field>
          <Field label="목표 종료일"><input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
        </div>
        {dayKey(base.dueAt) && dueAt !== dayKey(base.dueAt) && <Field label="종료일 변경 이유"><input value={scheduleReason} maxLength={1000} onChange={(e) => setScheduleReason(e.target.value)} placeholder="줄일 범위 또는 더 필요한 작업을 남기세요" /></Field>}
        <section className={styles.section} aria-label="완료 조건">
          <div className={styles.heading}><h3>완료 조건 <small>{plan.criteria.filter((item) => item.done).length}/{plan.criteria.length}</small></h3><Button variant="ghost" size="sm" disabled={plan.criteria.length >= 30 || busy} onClick={() => update("criteria", [...plan.criteria, { id: crypto.randomUUID(), text: "", done: false }])}>조건 추가</Button></div>
          <p>실제로 확인한 조건에 체크하세요. 예: 입력 → 저장 → 새로고침 → 재조회 성공.</p>
          {plan.criteria.map((item, index) => <div key={item.id} className={styles.criterion}>
            <Checkbox checked={item.done} label={`${index + 1}번 완료 조건 확인`} onChange={() => update("criteria", plan.criteria.map((row) => row.id === item.id ? { ...row, done: !row.done } : row))} />
            <input aria-label={`${index + 1}번 완료 조건`} maxLength={500} value={item.text} onChange={(e) => update("criteria", plan.criteria.map((row) => row.id === item.id ? { ...row, text: e.target.value } : row))} />
            <Button variant="ghost" size="sm" aria-label={`${index + 1}번 조건 삭제`} onClick={() => update("criteria", plan.criteria.filter((row) => row.id !== item.id))}><Iconed name="x" size={14} /></Button>
          </div>)}
        </section>
        <div className={styles.twoColumns}>
          <Field label="남은 예상 작업 (시간)"><input type="number" min="0" max="10000" step="0.5" value={plan.remainingHours ?? ""} onChange={(e) => update("remainingHours", e.target.value === "" ? null : Number(e.target.value))} placeholder="미정" /></Field>
          <Field label="종료일까지 확보한 시간"><input type="number" min="0" max="10000" step="0.5" value={plan.availableHours ?? ""} onChange={(e) => update("availableHours", e.target.value === "" ? null : Number(e.target.value))} placeholder="미정" /></Field>
        </div>
        <Field label="마무리를 막는 병목"><input value={plan.blocker} maxLength={1000} onChange={(e) => update("blocker", e.target.value)} placeholder="없으면 비워두세요" /></Field>
        <div className={styles.assessment} data-state={assessment.key}><strong>마무리 가능성 · {assessment.label}</strong><p>{assessment.reason}</p></div>
        <Field label="병목을 풀 다음 행동"><input value={plan.nextAction} maxLength={1000} onChange={(e) => update("nextAction", e.target.value)} placeholder="오늘 실행할 한 가지" /></Field>
        <Field label="다음 버전으로 넘길 범위"><textarea rows={2} value={plan.nextVersion} maxLength={4000} onChange={(e) => update("nextVersion", e.target.value)} placeholder="이번 완료 조건에서 제외한 개선 사항" /></Field>
        <Field label="결과물 링크"><input type="url" value={plan.resultUrl} maxLength={2000} onChange={(e) => update("resultUrl", e.target.value)} placeholder="https://…" /></Field>
        {safeResultUrl(plan.resultUrl) && <a className={styles.link} href={safeResultUrl(plan.resultUrl)} target="_blank" rel="noopener noreferrer">결과물 열어보기 ↗</a>}
        <section className={styles.section}>
          <h3>실제 실행 기록</h3>
          <p>버튼을 누른 시점을 기록합니다. 예정일과 실제 실행일은 따로 보관합니다.</p>
          <div className={styles.actions}>
            <Button variant="outline" disabled={busy || terminal || Boolean(base.startedAt) || Boolean(conflict)} onClick={() => save("start")}>{base.startedAt ? `착수 ${dateLabel(base.startedAt)}` : "착수 기록"}</Button>
            <Button variant="outline" disabled={busy || terminal || !base.startedAt || Boolean(conflict)} onClick={() => save("prototype")}>{base.delivery?.prototypeVerifiedAt ? `작동 확인 ${dateLabel(base.delivery.prototypeVerifiedAt)}` : "프로토타입 작동 확인"}</Button>
            <Button variant="ghost" disabled={busy || terminal || Boolean(conflict)} onClick={() => save(base.statusKey === "blocked" && base.delivery?.pausedAt ? "resume" : "pause")}>{base.statusKey === "blocked" && base.delivery?.pausedAt ? "다시 진행" : "보류 기록"}</Button>
            <Button variant="outline" disabled={busy || terminal || Boolean(conflict)} onClick={() => save("complete")}>{base.completedAt ? `완료 ${dateLabel(base.completedAt)}` : "검증 후 완료"}</Button>
          </div>
        </section>
        {base.delivery?.history?.length > 0 && <details className={styles.history}><summary>일정 변경 이력 · 최초 종료일 {dateLabel(base.delivery.originalDueAt)}</summary>{[...base.delivery.history].reverse().map((item, index) => <p key={`${item.at}-${index}`}><span className="mono">{dateLabel(item.from)} → {dateLabel(item.to)}</span><br />{item.reason} · {dateLabel(item.at)}</p>)}</details>}
        </fieldset>
      </form>
    </Drawer>
  );
}
