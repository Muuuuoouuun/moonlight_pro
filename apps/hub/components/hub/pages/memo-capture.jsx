"use client";
import React from "react";
import { Button, Checkbox, TruthBadge } from "../hub-primitives";
import {
  MEMO_DRAFT_KEY,
  MAX_MEMO_CHARS,
  newMemoDraft,
  MAX_MEMO_TITLE_CHARS,
  memoCapturePayload,
  readMemoFile,
  restoreMemoDraft,
  isMediaFile,
  readMediaFileBase64,
  appendMemoIntake,
} from "@/lib/memo-capture";
import styles from "./memo-capture.module.css";
import { memoHref, saveMemoAndVerify } from "@/lib/memo-save";
import { memoIntakeTaskSummary, prepareMemoIntakeTasks, saveMemoIntakeTasks } from "@/lib/memo-intake-tasks";

export function MemoCapture({ onSaved, fetchImpl = fetch }) {
  const [draft, setDraft] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [storageStatus, setStorageStatus] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState(null);
  const [savedId, setSavedId] = React.useState(null);
  const busyRef = React.useRef(false);
  const draftRef = React.useRef(null);
  const textarea = React.useRef(null);
  const opener = React.useRef(null);
  const intake = draft?.intake;
  const extractedData = intake?.data;
  const memoLocked = Boolean(intake?.memoId);
  React.useEffect(() => {
    let restored = null;
    try {
      restored = restoreMemoDraft(sessionStorage.getItem(MEMO_DRAFT_KEY));
    } catch {
      setStorageStatus(
        "임시 보관을 사용할 수 없습니다. 창을 떠나기 전에 저장하세요.",
      );
    }
    const initial = restored || newMemoDraft();
    draftRef.current = initial;
    setDraft(initial);
    setSavedId(initial.intake?.memoId || null);
    if (restored) {
      setOpen(true);
      setMessage("이 탭에서 작성하던 메모를 복원했습니다.");
    }
  }, []);
  const persist = React.useCallback(() => {
    try {
      const value = draftRef.current;
      if (value?.body || value?.title || value?.intake)
        sessionStorage.setItem(
          MEMO_DRAFT_KEY,
          JSON.stringify({ version: 1, draft: value }),
        );
      else sessionStorage.removeItem(MEMO_DRAFT_KEY);
      setStorageStatus(
        "이 탭에 임시 보관 · 새로고침 후 복원됩니다. 탭을 닫기 전 서버에 저장하세요.",
      );
    } catch {
      setStorageStatus(
        "임시 보관 실패 · 작성 내용은 화면에 유지됩니다. 떠나기 전에 서버에 저장하세요.",
      );
    }
  }, []);
  React.useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(persist, 400);
    return () => clearTimeout(timer);
  }, [draft, persist]);
  React.useEffect(() => {
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      persist();
    };
  }, [persist]);
  React.useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);
  function replaceDraft(next, persistNow = false) {
    draftRef.current = next;
    setDraft(next);
    if (persistNow) persist();
  }
  function update(patch) {
    if (draftRef.current?.intake?.memoId) return;
    // Editing after an uncertain save starts a distinct immutable snapshot, never overwrites it.
    const next = { ...draftRef.current, ...patch, id: crypto.randomUUID() };
    replaceDraft(next);
    setMessage("");
    setSavedId(null);
  }
  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
    if (draftRef.current?.intake) {
      setMessage("현재 추출 결과를 저장하거나 지운 뒤 다른 파일을 가져오세요.");
      return;
    }

    if (isMediaFile(file)) {
      busyRef.current = true;
      setBusy(true);
      setAiBusy(true);
      setMessage("AI가 사진/음성을 분석하고 있습니다… (Gemini 멀티모달 요약 및 할 일 추출)");
      try {
        const media = await readMediaFileBase64(file);
        const res = await fetchImpl("/api/hub/intake/multimodal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mediaBase64: media.base64,
            mimeType: media.mimeType,
          }),
        });
        const envelope = await res.json().catch(() => null);
        if (!res.ok || !envelope || envelope.status === "error") {
          setMessage(envelope?.error || "AI 분석에 실패했습니다.");
          return;
        }
        if (envelope.status === "preview") {
          setMessage(envelope.message || "GEMINI_API_KEY 설정이 필요합니다.");
          return;
        }
        const data = envelope.status === "ok" ? envelope.data : null;
        if (data) {
          replaceDraft(appendMemoIntake(draftRef.current, data, file.name), true);
          setSavedId(null);
          setMessage("AI 분석 완료: 요약 및 추출된 할 일 체크리스트를 확인하세요.");
        } else {
          setMessage("AI 분석 결과를 확인하지 못했습니다. 기존 입력은 유지했습니다.");
        }
      } catch (error) {
        setMessage(error.message || "미디어 분석 중 오류가 발생했습니다.");
      } finally {
        busyRef.current = false;
        setBusy(false);
        setAiBusy(false);
      }
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const incoming = await readMemoFile(file);
      if (draftRef.current?.body || draftRef.current?.title)
        setPendingFile(incoming);
      else {
        update(incoming);
        setMessage("파일 내용을 불러왔습니다. 확인 후 저장하세요.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save(event) {
    event?.preventDefault();
    if (busyRef.current || pendingFile) return;
    let payload;
    try {
      payload = memoCapturePayload(draftRef.current);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage("메모를 저장하고 있습니다.");
    persist();
    try {
      const result = await saveMemoAndVerify(payload, fetchImpl);
      setSavedId(result.id);

      let taskSummary = { total: 0, saved: 0, remaining: 0 };
      if (draftRef.current.intake) {
        const prepared = prepareMemoIntakeTasks(draftRef.current.intake, payload);
        replaceDraft({ ...draftRef.current, intake: prepared }, true);
        setMessage("메모 원문 저장을 확인했습니다. 선택한 할 일을 등록하고 있습니다.");
        const completed = await saveMemoIntakeTasks(prepared, fetchImpl, (progress) => {
          replaceDraft({ ...draftRef.current, intake: progress }, true);
        });
        taskSummary = memoIntakeTaskSummary(completed);
      }
      if (taskSummary.remaining) {
        setMessage(`메모는 저장됐습니다. 할 일 ${taskSummary.saved}/${taskSummary.total}건 등록 확인 · ${taskSummary.remaining}건은 확인이 필요합니다. 원문과 선택을 유지했습니다. 같은 내용으로 다시 확인하세요.`);
        onSaved?.({ id: result.id, memo: result.memo });
        return;
      }
      replaceDraft(newMemoDraft(), true);
      setMessage(
        result.status === "duplicate" && !taskSummary.total
          ? "이미 저장된 동일 메모를 확인했습니다. 중복 추가하지 않았습니다."
          : `저장 후 원문을 다시 불러와 확인했습니다.${taskSummary.saved > 0 ? ` (할 일 ${taskSummary.saved}건 등록 확인 · 업무 완료는 별도)` : ""}`,
      );
      onSaved?.({ id: result.id, memo: result.memo });
    } catch (error) {
      if (error.id) setSavedId(error.id);
      setMessage(
        error.name === "TimeoutError"
          ? "응답이 지연됐습니다. 입력을 바꾸지 않고 다시 저장하면 같은 메모를 확인합니다."
          : error.message,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.capture} aria-label="메모 작성">
      <div className={styles.heading}>
        <div>
          <h3>기록하기</h3>
        </div>
        <Button
          ref={opener}
          variant={open ? "ghost" : "primary"}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          disabled={busy}
        >
          {open ? "작성창 접기" : "새 메모"}
        </Button>
      </div>
      {open && draft ? (
        <form
          onSubmit={save}
          className={styles.form}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape" && !busy && !e.nativeEvent.isComposing) {
              e.stopPropagation();
              persist();
              setOpen(false);
              opener.current?.focus();
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              메모 본문
              <textarea
                ref={textarea}
                required
                maxLength={MAX_MEMO_CHARS}
                readOnly={memoLocked}
                rows={5}
                value={draft.body}
                onChange={(e) => update({ body: e.target.value })}
                placeholder="생각나는 대로 적거나 원문을 붙여넣으세요. Enter는 줄바꿈입니다."
              />
            </label>
            {aiBusy ? (
              <div className={styles.pending} role="status">
                <p>✦ Gemini 멀티모달 분석 중… (사진·음성에서 요약 및 할 일 추출 중)</p>
              </div>
            ) : null}
            {extractedData ? (
              <div className={styles.aiCard} role="region" aria-label="AI 멀티모달 추출 결과">
                <div className={styles.aiCardHeading}>
                  <span>✦ AI 멀티모달 추출: {extractedData.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={memoLocked}
                    onClick={() => replaceDraft({ ...draftRef.current, intake: null }, true)}
                  >
                    추출 결과 지우기
                  </Button>
                </div>
                {extractedData.summary ? (
                  <div>
                    <div className={styles.aiSectionTitle}>핵심 요약</div>
                    <div className={styles.aiSummary}>{extractedData.summary}</div>
                  </div>
                ) : null}
                {intake.actions.length ? (
                  <div>
                    <div className={styles.aiSectionTitle}>
                      추출된 할 일 ({intake.actions.length}건) · 선택한 항목을 메모 저장 후 등록
                    </div>
                    <ul className={styles.aiActionsList}>
                      {intake.actions.map((item) => (
                        <li key={item.id} className={styles.aiActionRow}>
                          <Checkbox
                            label={`${item.task} 등록 선택`}
                            checked={item.selected}
                            disabled={busy || memoLocked}
                            onChange={(selected) => replaceDraft({
                              ...draftRef.current,
                              intake: { ...intake, actions: intake.actions.map((action) => action.id === item.id ? { ...action, selected } : action) },
                            }, true)}
                          />
                          <div className={styles.aiActionText}>
                            <span>{item.task}</span>
                            {item.suggestedDue ? <span className={styles.aiActionDue}>기한: {item.suggestedDue}</span> : null}
                            {item.status !== "pending" ? <TruthBadge state={item.status === "saved" ? "live" : item.status === "failed" ? "error" : "partial"} label={item.status === "saved" ? "등록 확인" : item.status === "failed" ? "등록 실패" : "등록 확인 필요"} /> : null}
                            {item.error ? <p>{item.error}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {memoLocked ? <p>저장된 메모와 등록 요청을 유지하고 있습니다. 다시 확인하면 같은 할 일을 조회하거나 등록합니다.</p> : null}
              </div>
            ) : null}
            {draft.source.type === "file" ? (
              <p>
                출처: {draft.source.name} · {draft.source.originalBody ? "가져온 텍스트 원문을 이 탭에 보관합니다." : "미디어 파일은 보관하지 않습니다. 추출 내용을 확인하세요."}
              </p>
            ) : null}
            <details className={styles.options}>
              <summary>제목 · 라벨 · 파일/미디어 가져오기</summary>
              <div className={styles.tools}>
                <label className={styles.mediaButton}>
                  📷 🎙️ 사진·음성 AI 분석
                  <input
                    aria-label="사진 또는 음성 AI 분석"
                    type="file"
                    className={styles.mediaInput}
                    disabled={Boolean(intake)}
                    accept="image/*,audio/*,.jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                    onChange={chooseFile}
                  />
                </label>
                <label className={styles.file}>
                  TXT · Markdown 가져오기
                  <input
                    aria-label="메모 파일 가져오기"
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    disabled={Boolean(intake)}
                    onChange={chooseFile}
                  />
                </label>
                <span>사진·음성 14MB 이하 · UTF-8 텍스트 256KB 이하</span>
              </div>
              {pendingFile ? (
                <div className={styles.pending} role="status">
                  <p>
                    작성 중인 내용을 파일 내용으로 바꿀까요? 아직 서버에
                    저장하지 않았습니다.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      update(pendingFile);
                      setPendingFile(null);
                    }}
                  >
                    파일 내용으로 바꾸기
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPendingFile(null)}
                  >
                    기존 작성 유지
                  </Button>
                </div>
              ) : null}
              <label>
                제목 <span>선택 · 비우면 첫 문장을 사용합니다</span>
                <input
                  maxLength={MAX_MEMO_TITLE_CHARS}
                  readOnly={memoLocked}
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <div className={styles.fields}>
                <label>
                  라벨 <span>선택 · 쉼표로 구분</span>
                  <input
                    value={draft.labels}
                    maxLength={500}
                    readOnly={memoLocked}
                    placeholder="고객질문, 콘텐츠소재, 사업아이디어"
                    onChange={(e) => update({ labels: e.target.value })}
                  />
                </label>
              </div>
            </details>
            <label>
              기록 범위
              <select
                value={draft.scope}
                disabled={memoLocked}
                onChange={(e) => update({ scope: e.target.value })}
              >
                <option value="personal">개인</option>
                <option value="company">회사 업무</option>
              </select>
            </label>
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !draft.body.trim() || Boolean(pendingFile)}
              >
                {busy ? "저장 확인 중…" : memoLocked ? "미확인 할 일 다시 확인" : "메모 저장"}
              </Button>
              <span>
                ⌘ / Ctrl + Enter · {draft.body.length.toLocaleString()}자
              </span>
            </div>
          </fieldset>
          <p role="status">{storageStatus}</p>
        </form>
      ) : null}
      <p role="status" aria-live="polite" className={styles.feedback}>
        {message}
        {savedId ? (
          <>
            {" "}
            <a
              href={memoHref(savedId)}
            >
              저장된 메모 열기
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
