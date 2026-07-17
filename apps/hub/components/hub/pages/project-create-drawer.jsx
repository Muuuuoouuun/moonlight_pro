"use client";

import React from "react";
import { validateProjectDraft } from "@/lib/pms-ui";
import { Button, Drawer, Kbd } from "../hub-primitives";

const CONTROL_STYLE = {
  width: "100%",
  minHeight: 44,
  padding: "0 11px",
  fontSize: 16,
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

function feedbackFor(result) {
  if (result?.status === "pipeline-error") {
    return {
      state: "error",
      message: "프로젝트 입력은 유지했습니다. 콘텐츠 4단계를 원장에서 확인할 때까지 같은 요청으로 다시 시도하세요.",
    };
  }
  if (result?.status === "reload-error") {
    return {
      state: "error",
      message: "저장은 접수됐지만 새 원장에서 확인하지 못했습니다. 입력과 요청 ID를 유지했으니 다시 시도하세요.",
    };
  }
  if (result?.status === "conflict") {
    const detail = result.error === "stale-update"
      ? "다른 변경이 먼저 저장되었습니다. 입력은 유지했습니다. 원장을 다시 확인한 뒤 재시도하세요."
      : "같은 요청 ID에 다른 내용이 감지되었습니다. 입력과 요청 ID를 유지했습니다.";
    return { state: "conflict", message: detail };
  }
  if (result?.status === "preview") {
    return { state: "preview", message: "저장 위치가 연결되지 않아 저장되지 않았습니다. 입력은 유지했습니다." };
  }
  const suffix = result?.error ? ` (${result.error})` : "";
  return { state: "error", message: `프로젝트 저장에 실패했습니다. 다시 시도하세요.${suffix}` };
}

export function ProjectCreateDrawer({
  draft,
  areas = [],
  brands = [],
  entities = [],
  onChange,
  onClose,
  onSave,
  onRetryWithNewClientId,
  onOpenConflictProject,
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [errors, setErrors] = React.useState({});
  const [saveState, setSaveState] = React.useState("idle");
  const [feedback, setFeedback] = React.useState("");
  const [conflictProject, setConflictProject] = React.useState(null);
  const savingRef = React.useRef(false);
  const retryingClientIdRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const areaRef = React.useRef(null);
  const formId = React.useId();

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
    savingRef.current = false;
  }, [draft?.clientId]);

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
    const nextErrors = validateProjectDraft(candidate);
    setErrors(nextErrors);
    if (!nextErrors.title && !nextErrors.areaId) return true;

    setSaveState("invalid");
    setFeedback("필수 입력을 확인하세요.");
    requestAnimationFrame(() => {
      if (nextErrors.title) titleRef.current?.focus();
      else areaRef.current?.focus();
    });
    return false;
  }, []);

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
      const next = feedbackFor(result);
      setConflictProject(result?.status === "conflict" ? result.project || null : null);
      setSaveState(next.state);
      setFeedback(next.message);
    } catch (error) {
      setSaveState("error");
      setFeedback(`프로젝트 저장에 실패했습니다. 다시 시도하세요. (${error instanceof Error ? error.message : String(error)})`);
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
    setFeedback("기존 프로젝트를 원장에서 확인하는 중입니다.");
    try {
      const result = await onOpenConflictProject?.(conflictProject);
      if (result?.ok) {
        onClose?.();
        return;
      }
      setSaveState("conflict");
      setFeedback("기존 프로젝트를 새 원장에서 확인하지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
    } catch (error) {
      setSaveState("conflict");
      setFeedback(`기존 프로젝트를 열지 못했습니다. 입력은 유지했습니다. (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      savingRef.current = false;
    }
  }, [conflictProject, onClose, onOpenConflictProject]);

  React.useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        document.getElementById(formId)?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formId]);

  if (!draft) return null;
  const saving = saveState === "saving";
  return (
    <Drawer
      title="프로젝트 만들기"
      subtitle="큰 결과와 첫 행동부터 기록하세요."
      onClose={() => { if (!savingRef.current) onClose?.(); }}
      initialFocusRef={titleRef}
      width="min(440px, 100vw)"
      footerStyle={{ flexWrap: "wrap" }}
      footer={(
        <>
          {saveState === "conflict" && (
            <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button variant="outline" size="sm" onClick={handleRetryWithNewClientId} disabled={saving}>새 요청으로 다시 시도</Button>
              <Button variant="ghost" size="sm" onClick={handleOpenConflictProject} disabled={saving || !conflictProject}>기존 프로젝트 열기</Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>취소</Button>
          <div aria-live="polite" style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4, color: saveState === "error" || saveState === "conflict" ? "var(--danger)" : "var(--fg-muted)" }}>
            {feedback || <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Kbd>⌘↵</Kbd></span>}
          </div>
          <Button variant="primary" size="sm" type="submit" form={formId} disabled={saving}>
            {saving ? "만드는 중…" : "프로젝트 만들기"}
          </Button>
        </>
      )}
    >
      <form id={formId} onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <label style={LABEL_STYLE}>
          <span>프로젝트명 *</span>
          <input
            ref={titleRef}
            name="title"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="예: 8월 콘텐츠 운영"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "project-title-error" : undefined}
            style={CONTROL_STYLE}
          />
          {errors.title && <span id="project-title-error" role="alert" style={{ color: "var(--danger)", letterSpacing: 0 }}>{errors.title}</span>}
        </label>

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
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          {errors.areaId && <span id="project-area-error" role="alert" style={{ color: "var(--danger)", letterSpacing: 0 }}>{errors.areaId}</span>}
        </label>

        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 8, color: "var(--fg-muted)", fontSize: 12.5, textAlign: "left" }}
          >
            <span aria-hidden="true" style={{ transform: advancedOpen ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }}>›</span>
            <span style={{ flex: 1 }}>상세 설정</span>
            <span style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>브랜드 · 고객 · 상태</span>
          </button>
          {advancedOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, paddingTop: 10 }}>
              <label style={{ ...LABEL_STYLE, gridColumn: "1 / -1" }}>
                <span>브랜드</span>
                <select value={draft.brandId || ""} onChange={(event) => update("brandId", event.target.value || null)} style={CONTROL_STYLE}>
                  <option value="">브랜드 없음</option>
                  {brands.filter((brand) => brand.id !== "all").map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ ...LABEL_STYLE, gridColumn: "1 / -1" }}>
                <span>관련 리드/고객</span>
                <select value={draft.entityKey || ""} onChange={(event) => update("entityKey", event.target.value)} style={CONTROL_STYLE}>
                  <option value="">연결 없음</option>
                  {entities.map((entity) => (
                    <option key={entity.key} value={entity.key}>{entity.label}</option>
                  ))}
                </select>
              </label>
              <label style={LABEL_STYLE}>
                <span>상태</span>
                <select value={draft.status} onChange={(event) => update("status", event.target.value)} style={CONTROL_STYLE}>
                  <option value="draft">계획</option>
                  <option value="active">진행</option>
                  <option value="blocked">막힘</option>
                  <option value="completed">완료</option>
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
              <label style={{ ...LABEL_STYLE, gridColumn: "1 / -1" }}>
                <span>기한</span>
                <input type="date" value={draft.dueAt} onChange={(event) => update("dueAt", event.target.value)} style={CONTROL_STYLE} />
              </label>
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}
