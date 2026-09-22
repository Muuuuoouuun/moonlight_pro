"use client";

import React from "react";
import { projectAreaLabel, projectCreateFeedback, validateProjectDraft } from "@/lib/pms-ui";
import { Button, Drawer, Kbd } from "../hub-primitives";
import { deliveryDraft, validateDelivery } from "../../../../../packages/project-delivery/index.ts";
import { Iconed } from "../hub-icons";

const CONTROL_STYLE = {
  width: "100%",
  minHeight: 36,
  padding: "0 10px",
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--fg)",
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
};

const LABEL_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
  fontSize: 11,
  color: "var(--fg-dim)",
  letterSpacing: "0.04em",
};

function ProjectCreateSurface({
  presentation = "drawer",
  draft,
  areas = [],
  brands = [],
  entities = [],
  failedSources = [],
  onChange,
  onClose,
  onSave,
  onRetryWithNewClientId,
  onOpenConflictProject,
  onRetryAreas,
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [errors, setErrors] = React.useState({});
  const [saveState, setSaveState] = React.useState("idle");
  const [feedback, setFeedback] = React.useState("");
  const [conflictProject, setConflictProject] = React.useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const savingRef = React.useRef(false);
  const retryingClientIdRef = React.useRef(null);
  const initialDraftSignatureRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const areaRef = React.useRef(null);
  const formId = React.useId();
  const advancedId = React.useId();
  const inline = presentation === "inline";
  const areaUnavailable = failedSources.includes("areas");
  const areaEmpty = !areaUnavailable && areas.length === 0;
  const entityCatalogUnavailable = failedSources.includes("leads")
    || failedSources.includes("customer_accounts");
  const selectedArea = areas.find((area) => area.id === draft?.areaId) || null;
  const selectedBrand = brands.find((brand) => brand.id === draft?.brandId) || null;

  React.useEffect(() => {
    if (retryingClientIdRef.current === draft?.clientId) {
      retryingClientIdRef.current = null;
      return;
    }
    setAdvancedOpen(false);
    setErrors({});
    setSaveState("idle");
    setFeedback("");
    setConflictProject(null);
    setConfirmingDiscard(false);
    savingRef.current = false;
    initialDraftSignatureRef.current = draft ? JSON.stringify(draft) : null;
  }, [draft?.clientId]);

  React.useEffect(() => {
    if (!inline || !draft) return undefined;
    const frame = requestAnimationFrame(() => {
      const stage = titleRef.current?.closest(".hub-project-portfolio-stage");
      const content = titleRef.current?.closest(".hub-content");
      if (stage) stage.scrollTop = 0;
      if (content) content.scrollTop = 0;
      titleRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [draft?.clientId, inline]);

  const dirty = Boolean(draft
    && initialDraftSignatureRef.current
    && JSON.stringify(draft) !== initialDraftSignatureRef.current);

  // 인라인 생성도 OS confirm이나 추가 모달을 열지 않는다. ESC는 먼저 이 확인 상태만
  // 해제하고, 실제 버림은 화면 안의 명시 버튼으로만 수행한다.
  const requestClose = React.useCallback(() => {
    if (savingRef.current) return;
    if (confirmingDiscard) { setConfirmingDiscard(false); return; }
    if (dirty) { setConfirmingDiscard(true); return; }
    onClose?.();
  }, [confirmingDiscard, dirty, onClose]);

  const update = React.useCallback((key, value) => {
    onChange?.(key, value);
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, [onChange]);

  const validateDraft = React.useCallback((candidate) => {
    if (areaUnavailable || areaEmpty) {
      setSaveState("degraded");
      setFeedback(areaUnavailable
        ? "업무 분야 목록을 불러오지 못했습니다. 새 프로젝트 만들기를 잠시 사용할 수 없습니다."
        : "업무 분야 기록이 비어 있습니다. 기록을 다시 불러온 뒤 시도하세요.");
      return false;
    }
    const deliveryIssue = candidate.delivery ? validateDelivery(candidate.delivery, candidate.dueAt) : null;
    if (deliveryIssue) {
      setAdvancedOpen(true);
      setSaveState("invalid");
      setFeedback(deliveryIssue);
      return false;
    }
    const nextErrors = validateProjectDraft(candidate);
    setErrors(nextErrors);
    if (!nextErrors.title && !nextErrors.areaId) return true;

    setSaveState("invalid");
    setFeedback("필수 입력을 확인하세요.");
    if (nextErrors.areaId) setAdvancedOpen(true);
    requestAnimationFrame(() => {
      if (nextErrors.title) titleRef.current?.focus();
      else requestAnimationFrame(() => areaRef.current?.focus());
    });
    return false;
  }, [areaEmpty, areaUnavailable]);

  const saveDraft = React.useCallback(async (candidate) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    setFeedback("프로젝트를 저장하는 중입니다.");
    try {
      const result = await onSave?.(candidate);
      if (result?.ok && ["saved", "duplicate"].includes(result.status)) {
        setSaveState(result.status);
        setFeedback(result.status === "duplicate" ? "이미 저장된 프로젝트를 열었습니다." : "프로젝트를 만들었습니다.");
        onClose?.();
        return;
      }
      const next = projectCreateFeedback(result);
      setConflictProject(result?.status === "conflict" ? result.project || null : null);
      setSaveState(next.state);
      setFeedback(next.message);
    } catch {
      const next = projectCreateFeedback({ status: "error" });
      setSaveState(next.state);
      setFeedback(next.message);
    } finally {
      savingRef.current = false;
    }
  }, [onClose, onSave]);

  const handleSubmit = React.useCallback(async (event) => {
    event?.preventDefault?.();
    if (savingRef.current) return;
    if (!validateDraft(draft)) return;
    await saveDraft(draft);
  }, [draft, saveDraft, validateDraft]);

  const handleRetryWithNewClientId = React.useCallback(async () => {
    if (!validateDraft(draft)) return;
    const nextDraft = onRetryWithNewClientId?.(draft);
    if (!nextDraft) return;
    retryingClientIdRef.current = nextDraft.clientId;
    await saveDraft(nextDraft);
  }, [draft, onRetryWithNewClientId, saveDraft, validateDraft]);

  const handleOpenConflictProject = React.useCallback(async () => {
    if (savingRef.current || !conflictProject) return;
    savingRef.current = true;
    setSaveState("saving");
    setFeedback("기존 프로젝트를 기록에서 확인하는 중입니다.");
    try {
      const result = await onOpenConflictProject?.(conflictProject);
      if (result?.ok) {
        onClose?.();
        return;
      }
      setSaveState("conflict");
      setFeedback("기존 프로젝트를 새 기록에서 확인하지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
    } catch {
      setSaveState("conflict");
      setFeedback("기존 프로젝트를 열지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
    } finally {
      savingRef.current = false;
    }
  }, [conflictProject, onClose, onOpenConflictProject]);

  React.useEffect(() => {
    if (!draft) return undefined;
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        document.getElementById(formId)?.requestSubmit();
        return;
      }
      if (inline && event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, formId, inline, requestClose]);

  if (!draft) return null;
  const saving = saveState === "saving";
  const feedbackIsError = ["error", "conflict", "invalid", "degraded"].includes(saveState);
  const areaStatus = (selectedArea && projectAreaLabel(selectedArea)) || "업무 분야 확인 필요";
  const scopeStatus = draft.orgScope === "classin" ? "회사 업무" : "개인 업무";
  const minimalCreateCopy = draft.areaId
    ? "이름 하나면 충분합니다. 세부 내용과 하위 아이템은 지금 또는 만든 뒤에 이어서 정리할 수 있어요."
    : "프로젝트명과 업무 분야만 고르면 됩니다. 나머지는 만든 뒤 같은 화면에서 이어서 정리할 수 있어요.";

  const actions = confirmingDiscard ? (
    <>
      <span role="alert" className="project-create-discard-copy">
        저장하지 않은 변경이 있습니다 — 버리고 닫을까요?
      </span>
      <Button variant="ghost" size="sm" onClick={() => setConfirmingDiscard(false)} style={{ minHeight: 44 }}>계속 편집</Button>
      <Button variant="danger" size="sm" onClick={() => { setConfirmingDiscard(false); onClose?.(); }} style={{ minHeight: 44 }}>버리고 닫기</Button>
    </>
  ) : (
    <>
      {saveState === "conflict" && (
        <div className="project-create-conflict-actions">
          <Button variant="outline" size="sm" onClick={handleRetryWithNewClientId} disabled={saving} style={{ minHeight: 44 }}>새 요청으로 다시 시도</Button>
          <Button variant="ghost" size="sm" onClick={handleOpenConflictProject} disabled={saving || !conflictProject} style={{ minHeight: 44 }}>기존 프로젝트 열기</Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={requestClose} disabled={saving} style={{ minHeight: 44 }}>취소</Button>
      <div aria-live="polite" className="project-create-feedback" data-error={feedbackIsError ? "true" : "false"}>
        {feedback || <span>{draft.areaId ? "이름만으로 바로 만들 수 있습니다." : "업무 분야를 선택하면 바로 만들 수 있습니다."} <Kbd>⌘↵</Kbd></span>}
      </div>
      <Button variant="primary" size="sm" type="submit" form={formId} disabled={saving || areaUnavailable || areaEmpty} style={{ minHeight: 44 }}>
        {saving ? "만드는 중…" : "프로젝트 만들기"}
      </Button>
    </>
  );

  const form = (
    <form id={formId} onSubmit={handleSubmit} noValidate className="project-create-form">
      <label className="project-create-title-field" style={LABEL_STYLE}>
        <span>프로젝트명 *</span>
        <input
          ref={titleRef}
          name="title"
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="예: 갈무리 첫결제 SW"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "project-title-error" : undefined}
          style={{ ...CONTROL_STYLE, minHeight: inline ? 60 : 44 }}
        />
        {errors.title && <span id="project-title-error" role="alert" className="project-create-field-error">{errors.title}</span>}
      </label>

      <div className="project-create-defaults" aria-label="자동 적용 설정">
        <span><Iconed name="folder" size={13} />{areaStatus}</span>
        <span><Iconed name="projects" size={13} />{selectedBrand?.name || scopeStatus}</span>
        <span><Iconed name="clock" size={13} />계획 상태</span>
      </div>

      {!draft.areaId && !advancedOpen && !areaUnavailable && !areaEmpty && (
        <label className="project-create-quick-area" style={LABEL_STYLE}>
          <span><strong>업무 분야를 한 번만 선택하세요.</strong> 현재 기록에는 자동 적용할 표준 분야가 없습니다.</span>
          <select
            ref={areaRef}
            name="areaId"
            value=""
            onChange={(event) => update("areaId", event.target.value)}
            aria-invalid={Boolean(errors.areaId)}
            aria-describedby={errors.areaId ? "project-area-error" : undefined}
            style={CONTROL_STYLE}
          >
            <option value="">업무 분야 선택</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{projectAreaLabel(area)}</option>)}
          </select>
          {errors.areaId && <span id="project-area-error" role="alert" className="project-create-field-error">{errors.areaId}</span>}
        </label>
      )}

      {(areaUnavailable || areaEmpty) && (
        <div className="project-create-source-warning" role="status">
          <Iconed name="flag" size={14} />
          <span>{areaUnavailable
            ? "업무 분야 목록을 불러오지 못했습니다. 새 프로젝트 만들기를 잠시 사용할 수 없습니다."
            : "업무 분야 기록이 비어 있습니다. 운영 기록을 적용한 뒤 다시 불러오세요."}</span>
          <Button variant="outline" size="sm" onClick={onRetryAreas} style={{ minHeight: 44 }}>기록 다시 불러오기</Button>
        </div>
      )}

      <div className="project-create-disclosure">
        <button
          type="button"
          className="project-create-disclosure__trigger"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <Iconed name="chevronR" size={14} />
          <span><strong>세부 설정</strong><small>목표 · 하위 흐름 · 일정 · 연결</small></span>
          <span>{advancedOpen ? "접기" : "필요할 때 입력"}</span>
        </button>

        {advancedOpen && (
          <div id={advancedId} className="project-create-advanced-grid">
            <section className="project-create-field-group">
              <header>
                <span className="mono">01</span>
                <div><h3>세부 내용</h3><p>완료 모습과 첫 행동만 짧게 정리합니다.</p></div>
              </header>
              <label style={LABEL_STYLE}>
                <span>목표 결과</span>
                <textarea
                  name="summary"
                  value={draft.summary}
                  onChange={(event) => update("summary", event.target.value)}
                  placeholder="완료됐을 때 어떤 상태가 되어야 하나요?"
                  rows={4}
                  style={{ ...CONTROL_STYLE, minHeight: 104, padding: "10px 11px", resize: "vertical" }}
                />
              </label>
              <label style={LABEL_STYLE}>
                <span>다음 행동</span>
                <input
                  name="nextAction"
                  value={draft.nextAction}
                  onChange={(event) => update("nextAction", event.target.value)}
                  placeholder="가장 먼저 할 한 가지"
                  style={CONTROL_STYLE}
                />
              </label>
              <p className="project-create-group-note"><Iconed name="orders" size={13} />하위 아이템과 체크리스트는 만든 뒤 같은 프로젝트 화면에서 이어서 추가합니다.</p>
            </section>

            <section className="project-create-field-group">
              <header>
                <span className="mono">02</span>
                <div><h3>분류와 연결</h3><p>기본값이 맞으면 건드리지 않아도 됩니다.</p></div>
              </header>
              <label style={LABEL_STYLE}>
                <span>업무 분야 *</span>
                <select
                  ref={areaRef}
                  name="areaId"
                  value={draft.areaId || ""}
                  onChange={(event) => update("areaId", event.target.value)}
                  aria-invalid={Boolean(errors.areaId)}
                  aria-describedby={errors.areaId ? "project-area-error" : undefined}
                  style={CONTROL_STYLE}
                >
                  <option value="">업무 분야 선택</option>
                  {areas.map((area) => <option key={area.id} value={area.id}>{projectAreaLabel(area)}</option>)}
                </select>
                {errors.areaId && <span id="project-area-error" role="alert" className="project-create-field-error">{errors.areaId}</span>}
              </label>
              <label style={LABEL_STYLE}>
                <span>브랜드</span>
                <select value={draft.brandId || ""} onChange={(event) => update("brandId", event.target.value || null)} style={CONTROL_STYLE}>
                  <option value="">브랜드 없음</option>
                  {brands.filter((brand) => brand.id !== "all").map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </label>
              <label style={LABEL_STYLE}>
                <span>관련 리드/고객</span>
                <select
                  value={draft.entityKey || ""}
                  onChange={(event) => update("entityKey", event.target.value)}
                  aria-describedby={entityCatalogUnavailable ? "project-entity-catalog-unavailable" : undefined}
                  style={CONTROL_STYLE}
                >
                  <option value="">연결 없음</option>
                  {entities.map((entity) => (
                    <option key={entity.key} value={entity.key}>{entity.label}</option>
                  ))}
                </select>
                {entityCatalogUnavailable && (
                  <span id="project-entity-catalog-unavailable" role="status" className="project-create-field-error">
                    리드·고객 목록 일부를 불러오지 못했습니다.
                  </span>
                )}
              </label>
            </section>

            <section className="project-create-field-group project-create-field-group--schedule">
              <header>
                <span className="mono">03</span>
                <div><h3>일정과 상태</h3><p>정해진 값만 입력하고 나머지는 비워두세요.</p></div>
              </header>
              <div className="project-create-two-columns">
                <label style={LABEL_STYLE}>
                  <span>상태</span>
                  <select value={draft.status} onChange={(event) => update("status", event.target.value)} style={CONTROL_STYLE}>
                    <option value="draft">계획</option>
                    <option value="active">진행</option>
                    <option value="blocked">막힘</option>
                    <option value="archived">보관</option>
                  </select>
                </label>
                <label style={LABEL_STYLE}>
                  <span>우선순위</span>
                  <select value={draft.priority} onChange={(event) => update("priority", event.target.value)} style={CONTROL_STYLE}>
                    <option value="low">낮음</option>
                    <option value="medium">보통</option>
                    <option value="high">높음</option>
                    <option value="critical">긴급</option>
                  </select>
                </label>
              </div>
              <label style={LABEL_STYLE}>
                <span>최소 결과물</span>
                <input
                  style={CONTROL_STYLE}
                  value={draft.delivery?.deliverable || ""}
                  placeholder="이번 종료일까지 실제 사용할 결과물"
                  onChange={(event) => update("delivery", { ...deliveryDraft(draft.delivery), deliverable: event.target.value })}
                />
              </label>
              <div className="project-create-date-grid">
                {[["plannedStart", "착수 예정일"], ["prototypeDate", "프로토타입 확인일"]].map(([key, label]) => (
                  <label key={key} style={LABEL_STYLE}>
                    <span>{label}</span>
                    <input type="date" style={CONTROL_STYLE} value={draft.delivery?.[key] || ""} onChange={(event) => update("delivery", { ...deliveryDraft(draft.delivery), [key]: event.target.value })} />
                  </label>
                ))}
                <label style={LABEL_STYLE}>
                  <span>목표 종료일</span>
                  <input type="date" style={CONTROL_STYLE} value={draft.dueAt} onChange={(event) => update("dueAt", event.target.value)} />
                </label>
              </div>
            </section>
          </div>
        )}
      </div>
    </form>
  );

  if (inline) {
    return (
      <section className="project-create-inline" aria-labelledby={`${formId}-title`}>
        <header className="project-create-inline__header">
          <div>
            <span className="mono">NEW PROJECT</span>
            <h1 id={`${formId}-title`}>무엇을 시작할까요?</h1>
            <p>{minimalCreateCopy}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={requestClose} disabled={saving} aria-label="프로젝트 만들기 닫기">
            <Iconed name="x" size={14} /> 닫기
          </Button>
        </header>
        <div className="project-create-inline__body">{form}</div>
        <footer className="project-create-actions">{actions}</footer>
      </section>
    );
  }

  return (
    <Drawer
      title="프로젝트 만들기"
      subtitle="이름만 입력하고, 필요한 설정은 아래에서 펼치세요."
      onClose={requestClose}
      initialFocusRef={titleRef}
      width="min(420px, 100vw)"
      footerStyle={{ flexWrap: "wrap" }}
      footer={actions}
    >
      {form}
    </Drawer>
  );
}

export function ProjectCreateInline(props) {
  return <ProjectCreateSurface {...props} presentation="inline" />;
}

export function ProjectCreateDrawer(props) {
  return <ProjectCreateSurface {...props} presentation="drawer" />;
}
