"use client";

import React from "react";
import { projectAreaLabel, projectCreateFeedback, validateProjectDraft } from "@/lib/pms-ui";
import { Button, Drawer, Kbd } from "../hub-primitives";
import { validateDelivery } from "../../../../../packages/project-delivery/index.ts";

// DRAWER_INPUT_STYLE(hub-primitives)과 같은 32px/13px 밀도 — 모바일 44px 터치 플로어는
// hub-tokens.css의 coarse-pointer 미디어쿼리가 input/textarea/select 전체에 이미 강제한다.
const CONTROL_STYLE = {
  width: "100%",
  minHeight: 32,
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

export function ProjectCreateDrawer({
  draft,
  areas = [],
  brands = [],
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
  const savingRef = React.useRef(false);
  const retryingClientIdRef = React.useRef(null);
  const initialDraftSignatureRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const areaRef = React.useRef(null);
  const formId = React.useId();
  const areaUnavailable = failedSources.includes("areas");
  const areaEmpty = !areaUnavailable && areas.length === 0;
  const selectedArea = areas.find((area) => area.id === draft?.areaId);
  const selectedBrand = brands.find((brand) => brand.id === draft?.brandId);

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
    initialDraftSignatureRef.current = draft ? JSON.stringify(draft) : null;
  }, [draft?.clientId]);

  const dirty = Boolean(draft
    && initialDraftSignatureRef.current
    && JSON.stringify(draft) !== initialDraftSignatureRef.current);
  // 버림 확인은 EditDrawer와 같은 푸터 인라인 2단계 — window.confirm은 디자인 시스템·ESC
  // 레이어 밖 OS 다이얼로그다(백로그 M). ESC/오버레이/취소는 스트립부터 해제한다.
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  React.useEffect(() => { setConfirmingDiscard(false); }, [draft?.clientId]);
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
        : "업무 분야 원장이 비어 있습니다. 원장을 다시 불러온 뒤 시도하세요.");
      return false;
    }
    const deliveryIssue = candidate.delivery ? validateDelivery(candidate.delivery, candidate.dueAt) : null;
    if (deliveryIssue) { setSaveState("invalid"); setFeedback(deliveryIssue); return false; }
    const nextErrors = validateProjectDraft(candidate);
    setErrors(nextErrors);
    if (!nextErrors.title && !nextErrors.areaId) return true;

    setSaveState("invalid");
    if (nextErrors.areaId) setAdvancedOpen(true);
    setFeedback("필수 입력을 확인하세요.");
    requestAnimationFrame(() => {
      if (nextErrors.title) titleRef.current?.focus();
      else areaRef.current?.focus();
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
    setFeedback("기존 프로젝트를 원장에서 확인하는 중입니다.");
    try {
      const result = await onOpenConflictProject?.(conflictProject);
      if (result?.ok) {
        onClose?.();
        return;
      }
      setSaveState("conflict");
      setFeedback("기존 프로젝트를 새 원장에서 확인하지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
    } catch {
      setSaveState("conflict");
      setFeedback("기존 프로젝트를 열지 못했습니다. 입력은 유지했습니다. 다시 시도하세요.");
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
  const classificationOpen = advancedOpen || !draft.areaId || areaUnavailable || areaEmpty;
  return (
    <Drawer
      title="프로젝트 만들기"
      subtitle="이름만 정하고 시작하세요."
      onClose={requestClose}
      initialFocusRef={titleRef}
      width="min(420px, 100vw)"
      footerStyle={{ flexWrap: "wrap" }}
      footer={confirmingDiscard ? (
        <>
          <span role="alert" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4, color: "var(--fg-muted)" }}>
            저장하지 않은 변경이 있습니다 — 버리고 닫을까요?
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDiscard(false)} style={{ minHeight: 44 }}>계속 편집</Button>
          <Button variant="danger" size="sm" onClick={() => { setConfirmingDiscard(false); onClose?.(); }} style={{ minHeight: 44 }}>버리고 닫기</Button>
        </>
      ) : (
        <>
          {saveState === "conflict" && (
            <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button variant="outline" size="sm" onClick={handleRetryWithNewClientId} disabled={saving} style={{ minHeight: 44 }}>새 요청으로 다시 시도</Button>
              <Button variant="ghost" size="sm" onClick={handleOpenConflictProject} disabled={saving || !conflictProject} style={{ minHeight: 44 }}>기존 프로젝트 열기</Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={requestClose} disabled={saving} style={{ minHeight: 44 }}>취소</Button>
          <div aria-live="polite" style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4, color: saveState === "error" || saveState === "conflict" ? "var(--danger)" : "var(--fg-muted)" }}>
            {feedback || <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Kbd>⌘↵</Kbd></span>}
          </div>
          <Button variant="primary" size="sm" type="submit" form={formId} disabled={saving || areaUnavailable || areaEmpty} style={{ minHeight: 44 }}>
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
            disabled={saving}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="예: 갈무리 첫결제 SW"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "project-title-error" : undefined}
            style={CONTROL_STYLE}
          />
          {errors.title && <span id="project-title-error" role="alert" style={{ color: "var(--danger)", letterSpacing: 0 }}>{errors.title}</span>}
        </label>

        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--fg-muted)" }}>
          목표·다음 행동은 만든 뒤 <strong style={{ color: "var(--fg-dim)", fontWeight: 500 }}>편집</strong>에서,
          일정·완료 조건은 <strong style={{ color: "var(--fg-dim)", fontWeight: 500 }}>계획·검증</strong>에서 설정하세요.
        </p>
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--fg-muted)" }}>
              업무 분류 · {selectedArea ? projectAreaLabel(selectedArea) : "선택 필요"}
            </span>
            <Button variant="ghost" size="sm" disabled={saving} aria-expanded={classificationOpen} aria-controls="project-create-classification" onClick={() => setAdvancedOpen((open) => !open)} style={{ minHeight: 44 }}>
              {classificationOpen ? "접기" : "분류 변경"}
            </Button>
          </div>
          {selectedBrand && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>연결 · {selectedBrand.name}</p>}
          <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--fg-muted)" }}>비슷한 프로젝트를 구분하는 분류입니다. 만든 뒤에도 바꿀 수 있어요.</p>
        </div>
        {classificationOpen && (
          <div id="project-create-classification">
            <label style={LABEL_STYLE}>
              <span>업무 분류</span>
              <select
                ref={areaRef}
                name="areaId"
                disabled={saving}
                value={draft.areaId || ""}
                onChange={(event) => update("areaId", event.target.value)}
                aria-invalid={Boolean(errors.areaId)}
                aria-describedby={[
                  errors.areaId ? "project-area-error" : null,
                  areaUnavailable ? "project-area-unavailable" : null,
                  areaEmpty ? "project-area-empty" : null,
                ].filter(Boolean).join(" ") || undefined}
                style={CONTROL_STYLE}
              >
                <option value="">분류 선택</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{projectAreaLabel(area)}</option>)}
              </select>
              {errors.areaId && <span id="project-area-error" role="alert" style={{ color: "var(--danger)", letterSpacing: 0 }}>{errors.areaId}</span>}
              {areaUnavailable && (
                <span id="project-area-unavailable" role="status" style={{ color: "var(--danger)", letterSpacing: 0 }}>
                  업무 분야 목록을 불러오지 못했습니다. 새 프로젝트 만들기를 잠시 사용할 수 없습니다.
                </span>
              )}
            </label>
            {areaEmpty && (
              <div id="project-area-empty" role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", letterSpacing: 0 }}>
                <span style={{ flex: 1, minWidth: 180, color: "var(--danger)", fontSize: 11 }}>
                  업무 분야 원장이 비어 있습니다. 운영 원장을 적용한 뒤 다시 불러오세요.
                </span>
                <Button variant="outline" size="sm" onClick={onRetryAreas} style={{ minHeight: 44 }}>원장 다시 불러오기</Button>
              </div>
            )}
          </div>
        )}
      </form>
    </Drawer>
  );
}
