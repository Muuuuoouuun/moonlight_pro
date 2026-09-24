"use client";

import React from "react";
import { Button, Drawer, Checkbox } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { dayKey, validDay, deliveryDraft, deliveryAssessment, completionIssue, validateDelivery, safeResultUrl } from "../../../../../packages/project-delivery/index.ts";
import styles from "./project-delivery.module.css";

const dateLabel = (value) => dayKey(value)?.replaceAll("-", ".") || "미정";
const acceptanceText = (plan) => JSON.stringify(plan.criteria.map(({ id, text }) => ({ id, text })));

// The server invalidates verification when the artifact or acceptance text changes.
// Mirror that rule before presenting the completion action as ready.
export function deliveryVerificationAt(project, plan) {
  const previous = deliveryDraft(project.delivery || {});
  return plan.deliverable === previous.deliverable && plan.resultUrl === previous.resultUrl
    && acceptanceText(plan) === acceptanceText(previous) ? project.delivery?.prototypeVerifiedAt || null : null;
}

export function deliveryValidationIssue(plan, dueAt) {
  const message = validateDelivery(plan, dueAt);
  if (!message) return null;
  let field = "deliverable";
  if ([plan.plannedStart, plan.prototypeDate].some((day) => day && !validDay(day))) {
    field = plan.plannedStart && !validDay(plan.plannedStart) ? "plannedStart" : "prototypeDate";
  } else if (message.includes("순서")) {
    const dates = [["plannedStart", plan.plannedStart], ["prototypeDate", plan.prototypeDate], ["dueAt", dayKey(dueAt)]].filter(([, day]) => day);
    field = dates.find(([, day], index) => index > 0 && day < dates[index - 1][1])?.[0] || "dueAt";
  }
  else if (message.includes("종료일")) field = "dueAt";
  else if (message.includes("완료 조건")) field = "criteria";
  else if (message.includes("작업 시간")) field = [plan.remainingHours, plan.availableHours].findIndex((hours) => hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 10000)) === 0 ? "remainingHours" : "availableHours";
  else if (message.includes("링크")) field = "resultUrl";
  return { message, field };
}

export function ProjectDeliverySummary({ project, onManage, compact = false }) {
  const plan = deliveryDraft(project.delivery || {});
  const count = plan.criteria.filter((item) => item.done).length;
  const hasDates = project.startedAt || project.delivery?.prototypeVerifiedAt || project.completedAt;
  return (
    <section className={styles.summary} data-compact={compact} aria-label="결과·완료 기준">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>결과·완료 기준</span><h3>{plan.deliverable || "필요할 때 결과와 완료 기준을 남기세요"}</h3></div>
        <Button variant="ghost" size="sm" onClick={() => onManage?.(project)}>{plan.deliverable || plan.criteria.length ? "편집" : "추가"}</Button>
      </div>
      {(plan.criteria.length > 0 || project.dueAt || hasDates) && <div className={styles.meta}>
        {plan.criteria.length > 0 && <span><Iconed name="check" size={13} />완료 기준 <span className="mono">{count}/{plan.criteria.length}</span></span>}
        {project.dueAt && <span><Iconed name="calendar" size={13} />목표 <span className="mono">{dateLabel(project.dueAt)}</span></span>}
        {project.completedAt ? <span>완료 <span className="mono">{dateLabel(project.completedAt)}</span></span>
          : project.delivery?.prototypeVerifiedAt ? <span>작동 확인 <span className="mono">{dateLabel(project.delivery.prototypeVerifiedAt)}</span></span>
          : project.startedAt && <span>착수 <span className="mono">{dateLabel(project.startedAt)}</span></span>}
      </div>}
      {plan.blocker && <p className={styles.blocker}><Iconed name="flag" size={13} />막힌 점 · {plan.blocker}</p>}
    </section>
  );
}

function Field({ label, children, error, errorId }) {
  return <div className={styles.field}><label className={styles.fieldControl}><span>{label}</span>{children}</label>{error && <span id={errorId} className={styles.fieldError}>{error}</span>}</div>;
}

export function ProjectDeliveryEditor({ project, onClose, onSave, intent = "edit" }) {
  const [base, setBase] = React.useState(project);
  const [plan, setPlan] = React.useState(() => deliveryDraft(project.delivery || {}));
  const [dueAt, setDueAt] = React.useState(dayKey(project.dueAt));
  const [scheduleReason, setScheduleReason] = React.useState("");
  const [criterionText, setCriterionText] = React.useState("");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [executionOpen, setExecutionOpen] = React.useState(intent === "complete");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState(false);
  const [errorField, setErrorField] = React.useState("");
  const [discard, setDiscard] = React.useState(false);
  const [conflict, setConflict] = React.useState(null);
  const busyRef = React.useRef(false);
  const titleRef = React.useRef(null);
  const fieldRefs = React.useRef({});
  const formId = React.useId();
  const errorId = `${formId}-error`;
  const dirty = JSON.stringify(plan) !== JSON.stringify(deliveryDraft(base.delivery || {})) || dueAt !== dayKey(base.dueAt) || Boolean(criterionText.trim());
  const terminal = base.statusKey === "completed" || base.statusKey === "archived";
  const verifiedAt = deliveryVerificationAt(base, plan);
  const verificationChanged = Boolean(base.delivery?.prototypeVerifiedAt && !verifiedAt);
  const paused = base.statusKey === "blocked" && Boolean(base.delivery?.pausedAt);
  const assessment = deliveryAssessment(plan, { dueAt, prototypeVerifiedAt: verifiedAt, completed: base.statusKey === "completed" && Boolean(verifiedAt), paused });
  const clearFeedback = () => { setMessage(""); setError(false); setErrorField(""); };
  const update = (field, value) => { setPlan((current) => ({ ...current, [field]: value })); clearFeedback(); };
  const close = () => { if (busyRef.current) return; if (dirty) { setDiscard(true); return; } onClose(); };
  const inputProps = (field) => ({ ref: (node) => { fieldRefs.current[field] = node; }, "aria-invalid": errorField === field || undefined, "aria-describedby": errorField === field ? errorId : undefined });
  const fieldError = (field) => errorField === field ? { error: message, errorId } : {};
  const reveal = (field) => {
    if (["plannedStart", "prototypeDate", "remainingHours", "availableHours", "blocker", "nextAction", "nextVersion"].includes(field) || field === "prototype") setAdvancedOpen(true);
    if (["resultUrl", "start", "prototype"].includes(field)) setExecutionOpen(true);
    requestAnimationFrame(() => {
      const emptyCriterion = field === "criteria" && plan.criteria.find((item) => !item.text.trim());
      const target = field === "deliverable" ? titleRef.current : emptyCriterion ? fieldRefs.current[`criterion-${emptyCriterion.id}`] : fieldRefs.current[field === "prototype" && !plan.prototypeDate ? "prototypeDate" : field];
      target?.focus();
    });
  };
  const fail = (issue, field) => { setError(true); setMessage(issue); setErrorField(field); reveal(field); };
  const addCriterion = () => {
    const text = criterionText.trim();
    if (!text || busyRef.current || plan.criteria.length >= 30) return;
    update("criteria", [...plan.criteria, { id: crypto.randomUUID(), text, done: false }]);
    setCriterionText("");
    fieldRefs.current.criteria?.focus();
  };
  const missing = [
    !plan.deliverable.trim() && { label: "결과", field: "deliverable" },
    plan.criteria.some((item) => !item.done) && { label: "등록한 완료 기준 확인", field: "criteria" },
    plan.prototypeDate && !verifiedAt && { label: verificationChanged ? "작동 재확인" : "작동 확인", field: "prototype" },
    Boolean(plan.blocker.trim()) && { label: "막힌 점 해결", field: "blocker" },
  ].filter(Boolean);
  const advancedCount = [plan.plannedStart, plan.prototypeDate, plan.remainingHours !== null, plan.availableHours !== null, plan.blocker, plan.nextAction, plan.nextVersion].filter(Boolean).length;

  async function save(event) {
    if (busyRef.current || conflict) return;
    // A typed acceptance condition is a draft too; saving must never drop it.
    const candidate = criterionText.trim() && plan.criteria.length < 30
      ? { ...plan, criteria: [...plan.criteria, { id: crypto.randomUUID(), text: criterionText.trim(), done: false }] } : plan;
    if (candidate !== plan) { setPlan(candidate); setCriterionText(""); }
    const invalid = deliveryValidationIssue(candidate, dueAt);
    if (invalid) { fail(invalid.message, invalid.field); return; }
    if (dayKey(base.dueAt) && dueAt !== dayKey(base.dueAt) && !scheduleReason.trim()) { fail("목표 종료일 변경 이유를 남겨주세요.", "scheduleReason"); return; }
    if (event === "prototype" && (!base.startedAt || !candidate.prototypeDate)) { fail(!base.startedAt ? "실제 착수를 먼저 기록하세요." : "프로토타입 확인일을 먼저 정하세요.", !base.startedAt ? "start" : "prototypeDate"); return; }
    if (event === "pause" && !candidate.blocker.trim()) { fail("막힌 점에 보류 이유를 남겨주세요.", "blocker"); return; }
    if (event === "resume" && candidate.blocker.trim()) { fail("막힌 점을 해결하거나 다음 버전으로 옮긴 뒤 다시 진행하세요.", "blocker"); return; }
    if (event === "complete") {
      const issue = completionIssue(candidate, deliveryVerificationAt(base, candidate));
      if (issue) {
        const field = !candidate.deliverable.trim() ? "deliverable" : candidate.criteria.some((item) => !item.done) ? "criteria" : candidate.prototypeDate && !deliveryVerificationAt(base, candidate) ? "prototype" : "blocker";
        fail(issue, field); return;
      }
    }
    busyRef.current = true; setBusy(true); setError(false); setErrorField(""); setMessage("저장 중…");
    try {
      const result = await onSave(base, { delivery: candidate, dueAt, scheduleReason,
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
      setMessage(result.message || (event === "complete" ? "결과를 확인하고 완료했습니다." : "저장했습니다."));
    } catch { setError(true); setMessage("연결을 확인한 뒤 다시 저장하세요. 입력은 유지했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <Drawer title="결과·완료 기준" subtitle={project.name} onClose={close} initialFocusRef={titleRef} width="min(640px, 100vw)"
      footerStyle={{ flexWrap: "wrap", gap: 8 }}
      footer={<>
        <div role={error ? "alert" : "status"} aria-live="polite" className={styles.feedback} data-error={error}>{message}</div>
        {discard ? <><span>저장하지 않은 변경이 있습니다.</span><Button variant="ghost" onClick={() => setDiscard(false)}>계속 편집</Button><Button variant="danger" onClick={onClose}>버리고 닫기</Button></> : <>
          <Button variant="ghost" onClick={close} disabled={busy}>닫기</Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy || Boolean(conflict)}>{busy ? "저장 중…" : "저장"}</Button>
        </>}
      </>}>
      <form id={formId} className={styles.editor} noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
        <fieldset disabled={busy} className={styles.fields}>
          {conflict && <div className={styles.conflict} role="alert">
            <strong>다른 화면에서 프로젝트가 변경됐습니다.</strong>
            <p>내 입력은 유지했습니다. 최신 기록을 확인한 뒤 반영하세요.</p>
            <p>최신 결과물: {conflict.meta?.delivery?.deliverable || "미정"} · 종료일: {dateLabel(conflict.due_at)}</p>
            <Button variant="outline" onClick={() => { setBase({ ...base, delivery: conflict.meta?.delivery, dueAt: conflict.due_at, startedAt: conflict.started_at, completedAt: conflict.completed_at, statusKey: conflict.status, updatedAt: conflict.updated_at }); setConflict(null); setMessage("최신 기록을 기준으로 내 입력을 다시 저장할 수 있습니다."); }}>내 입력으로 다시 검토</Button>
            <Button variant="ghost" onClick={() => { const next = { ...base, delivery: conflict.meta?.delivery, dueAt: conflict.due_at, startedAt: conflict.started_at, completedAt: conflict.completed_at, statusKey: conflict.status, updatedAt: conflict.updated_at }; setBase(next); setPlan(deliveryDraft(next.delivery)); setDueAt(dayKey(next.dueAt)); setScheduleReason(""); setCriterionText(""); setConflict(null); clearFeedback(); }}>최신 기록 불러오기</Button>
          </div>}
          <p className={styles.intro}>할 일은 계획 입력 없이 바로 진행할 수 있습니다. 결과와 기준은 필요한 만큼 남기세요.</p>
          <Field label="이번에 남길 결과" {...fieldError("deliverable")}><textarea {...inputProps("deliverable")} ref={titleRef} rows={2} maxLength={2000} value={plan.deliverable} onChange={(e) => update("deliverable", e.target.value)} placeholder="이 프로젝트가 끝나면 무엇이 남나요?" /></Field>
          <Field label="목표일 · 선택" {...fieldError("dueAt")}><input {...inputProps("dueAt")} type="date" value={dueAt} onChange={(e) => { setDueAt(e.target.value); clearFeedback(); }} /></Field>
          {dayKey(base.dueAt) && dueAt !== dayKey(base.dueAt) && <Field label="목표일 변경 이유" {...fieldError("scheduleReason")}><input {...inputProps("scheduleReason")} value={scheduleReason} maxLength={1000} onChange={(e) => { setScheduleReason(e.target.value); clearFeedback(); }} placeholder="일정이 달라진 이유를 남기세요" /></Field>}
          <section className={styles.section} aria-label="완료 기준">
            <div className={styles.heading}><h3>완료 기준 <small className="mono">{plan.criteria.filter((item) => item.done).length}/{plan.criteria.length}</small></h3></div>
            <p>실제로 확인한 기준에 체크하세요. 할 일 목록과는 별도로 보관됩니다.</p>
            {plan.criteria.map((item, index) => <div key={item.id} className={styles.criterion}>
              <Checkbox checked={item.done} label={`${index + 1}번 완료 기준 확인`} onChange={() => update("criteria", plan.criteria.map((row) => row.id === item.id ? { ...row, done: !row.done } : row))} />
              <input ref={(node) => { fieldRefs.current[`criterion-${item.id}`] = node; }} aria-label={`${index + 1}번 완료 기준`} aria-invalid={errorField === "criteria" && !item.text.trim() || undefined} aria-describedby={errorField === "criteria" && !item.text.trim() ? errorId : undefined} maxLength={500} value={item.text} onChange={(e) => update("criteria", plan.criteria.map((row) => row.id === item.id ? { ...row, text: e.target.value } : row))} />
              <Button variant="ghost" size="sm" aria-label={`${index + 1}번 기준 삭제`} onClick={() => update("criteria", plan.criteria.filter((row) => row.id !== item.id))}><Iconed name="x" size={14} /></Button>
            </div>)}
            <div className={styles.criterionComposer}>
              <input {...inputProps("criteria")} aria-label="완료 기준 추가" placeholder="완료 기준 입력…" maxLength={500} disabled={plan.criteria.length >= 30} value={criterionText} onChange={(e) => { setCriterionText(e.target.value); clearFeedback(); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); addCriterion(); } }} />
              <Button variant="ghost" size="sm" disabled={!criterionText.trim() || plan.criteria.length >= 30} onClick={addCriterion}>추가</Button>
            </div>
            {errorField === "criteria" && <p id={errorId} className={styles.fieldError}>{message}</p>}
          </section>
          <details className={styles.disclosure} open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary><span>자세한 계획 <small>{advancedCount ? `${advancedCount}개 항목 입력됨` : "일정·시간·막힌 점"}</small></span></summary>
            <div className={styles.disclosureBody}>
              <div className={styles.twoColumns}>
                <Field label="착수 예정일" {...fieldError("plannedStart")}><input {...inputProps("plannedStart")} type="date" value={plan.plannedStart} onChange={(e) => update("plannedStart", e.target.value)} /></Field>
                <Field label="프로토타입 확인일" {...fieldError("prototypeDate")}><input {...inputProps("prototypeDate")} type="date" value={plan.prototypeDate} onChange={(e) => update("prototypeDate", e.target.value)} /></Field>
                <Field label="남은 작업 (시간)" {...fieldError("remainingHours")}><input {...inputProps("remainingHours")} type="number" min="0" max="10000" step="0.5" value={plan.remainingHours ?? ""} onChange={(e) => update("remainingHours", e.target.value === "" ? null : Number(e.target.value))} placeholder="선택" /></Field>
                <Field label="확보한 시간" {...fieldError("availableHours")}><input {...inputProps("availableHours")} type="number" min="0" max="10000" step="0.5" value={plan.availableHours ?? ""} onChange={(e) => update("availableHours", e.target.value === "" ? null : Number(e.target.value))} placeholder="선택" /></Field>
              </div>
              <Field label="막힌 점" {...fieldError("blocker")}><input {...inputProps("blocker")} value={plan.blocker} maxLength={1000} onChange={(e) => update("blocker", e.target.value)} placeholder="없으면 비워두세요" /></Field>
              <Field label="다음 행동"><input {...inputProps("nextAction")} value={plan.nextAction} maxLength={1000} onChange={(e) => update("nextAction", e.target.value)} placeholder="막힌 점을 풀기 위해 할 한 가지" /></Field>
              <Field label="다음 버전으로 넘길 범위"><textarea {...inputProps("nextVersion")} rows={2} value={plan.nextVersion} maxLength={4000} onChange={(e) => update("nextVersion", e.target.value)} placeholder="이번 완료 범위에서 제외한 개선 사항" /></Field>
              {assessment.key !== "unknown" && <div className={styles.assessment} data-state={assessment.key}><strong>마무리 가능성 · {assessment.label}</strong><p>{assessment.reason}</p></div>}
              {!terminal && <Button variant="ghost" size="sm" disabled={busy || Boolean(conflict)} onClick={() => save(paused ? "resume" : "pause")}>{paused ? "다시 진행" : "보류 기록"}</Button>}
            </div>
          </details>
          <details className={styles.disclosure} open={executionOpen} onToggle={(event) => setExecutionOpen(event.currentTarget.open)}>
            <summary><span>실행·완료 기록 <small>{base.completedAt ? `완료 ${dateLabel(base.completedAt)}` : verifiedAt ? "작동 확인됨" : verificationChanged ? "작동 재확인 필요" : "마무리할 때 확인"}</small></span></summary>
            <div className={styles.disclosureBody}>
              <Field label="결과물 링크 · 선택" {...fieldError("resultUrl")}><input {...inputProps("resultUrl")} type="url" value={plan.resultUrl} maxLength={2000} onChange={(e) => update("resultUrl", e.target.value)} placeholder="https://…" /></Field>
              {safeResultUrl(plan.resultUrl) && <a className={styles.link} href={safeResultUrl(plan.resultUrl)} target="_blank" rel="noopener noreferrer">결과물 열어보기 <Iconed name="arrowRight" size={13} /></a>}
              {!terminal && <div className={styles.readiness}>
                <strong>{missing.length ? "완료 전 확인" : "완료를 기록할 준비가 됐습니다"}</strong>
                {missing.length > 0 && <div className={styles.missing}>{missing.map((item) => <Button variant="ghost" size="sm" key={item.field} onClick={() => reveal(item.field)}>{item.label}<Iconed name="arrowRight" size={12} /></Button>)}</div>}
                {verificationChanged && <p>결과물이나 완료 기준이 바뀌어 실제 작동을 다시 확인해야 합니다.</p>}
              </div>}
              <div className={styles.executionStep}>
                <span><strong>착수</strong><small>{base.startedAt ? dateLabel(base.startedAt) : "할 일을 시작할 때 기록"}</small></span>
                <Button ref={(node) => { fieldRefs.current.start = node; }} variant="outline" size="sm" disabled={busy || terminal || Boolean(base.startedAt) || Boolean(conflict)} onClick={() => save("start")}>{base.startedAt ? "기록됨" : "착수 기록"}</Button>
              </div>
              {plan.prototypeDate && <div className={styles.executionStep}>
                <span><strong>프로토타입 작동 확인</strong><small>{verifiedAt ? dateLabel(verifiedAt) : "실제 작동을 확인한 뒤 기록"}</small></span>
                <Button ref={(node) => { fieldRefs.current.prototype = node; }} variant="outline" size="sm" disabled={busy || terminal || Boolean(conflict)} onClick={() => save("prototype")}>{verifiedAt ? "다시 확인" : "작동 확인"}</Button>
              </div>}
              {(errorField === "start" || errorField === "prototype") && <p id={errorId} className={styles.fieldError}>{message}</p>}
              <Button variant="outline" disabled={busy || terminal || Boolean(conflict)} onClick={() => save("complete")}>{base.completedAt ? `완료 ${dateLabel(base.completedAt)}` : "결과 확인 후 프로젝트 완료"}</Button>
            </div>
          </details>
          {base.delivery?.history?.length > 0 && <details className={styles.history}><summary>일정 변경 이력 · 최초 목표일 {dateLabel(base.delivery.originalDueAt)}</summary>{[...base.delivery.history].reverse().map((item, index) => <p key={`${item.at}-${index}`}><span className="mono">{dateLabel(item.from)} → {dateLabel(item.to)}</span><br />{item.reason} · {dateLabel(item.at)}</p>)}</details>}
        </fieldset>
      </form>
    </Drawer>
  );
}
