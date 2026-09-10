"use client";
import React from "react";
import { Button } from "../hub-primitives";
import {
  MEMO_DRAFT_KEY,
  MAX_MEMO_CHARS,
  newMemoDraft,
  memoCapturePayload,
  readMemoFile,
  restoreMemoDraft,
} from "@/lib/memo-capture";
import styles from "./memo-capture.module.css";
import { saveMemoAndVerify } from "@/lib/memo-save";

export function MemoCapture({ onSaved, fetchImpl = fetch }) {
  const [draft, setDraft] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [storageStatus, setStorageStatus] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState(null);
  const [savedId, setSavedId] = React.useState(null);
  const busyRef = React.useRef(false);
  const draftRef = React.useRef(null);
  const textarea = React.useRef(null);
  const opener = React.useRef(null);
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
    if (restored) {
      setOpen(true);
      setMessage("이 탭에서 작성하던 메모를 복원했습니다.");
    }
  }, []);
  const persist = React.useCallback(() => {
    try {
      const value = draftRef.current;
      if (value?.body || value?.title)
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
  function update(patch) {
    // Editing after an uncertain save starts a distinct immutable snapshot, never overwrites it.
    const next = { ...draftRef.current, ...patch, id: crypto.randomUUID() };
    draftRef.current = next;
    setDraft(next);
    setMessage("");
    setSavedId(null);
  }
  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
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
      const empty = newMemoDraft();
      draftRef.current = empty;
      setDraft(empty);
      try {
        sessionStorage.removeItem(MEMO_DRAFT_KEY);
      } catch {
        /* safe receipt retained */
      }
      setMessage(
        result.status === "duplicate"
          ? "이미 저장된 동일 메모를 확인했습니다. 중복 추가하지 않았습니다."
          : "저장 후 원문을 다시 불러와 확인했습니다.",
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
          <h3>생각을 먼저 남기세요</h3>
          <p>
            짧은 생각부터 긴 기록까지. 라벨은 나중에 다시 찾는 단서가 됩니다.
          </p>
        </div>
        <Button
          ref={opener}
          variant={open ? "ghost" : "primary"}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          disabled={busy}
        >
          {open ? "작성창 접기" : "새 메모 · 파일 가져오기"}
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
            <div className={styles.tools}>
              <label className={styles.file}>
                TXT · Markdown 가져오기
                <input
                  aria-label="메모 파일 가져오기"
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={chooseFile}
                />
              </label>
              <span>UTF-8 · 파일 256KB 이하 · 본문 최대 100,000자</span>
            </div>
            {pendingFile ? (
              <div className={styles.pending} role="status">
                <p>
                  작성 중인 내용을 파일 내용으로 바꿀까요? 아직 서버에 저장하지
                  않았습니다.
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
                maxLength={300}
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <label>
              메모 본문
              <textarea
                ref={textarea}
                required
                maxLength={MAX_MEMO_CHARS}
                rows={10}
                value={draft.body}
                onChange={(e) => update({ body: e.target.value })}
                placeholder="생각나는 대로 적거나 원문을 붙여넣으세요. Enter는 줄바꿈입니다."
              />
            </label>
            {draft.source.type === "file" ? (
              <p>
                출처: {draft.source.name} · 가져온 파일 원문은 별도로
                보존합니다.
              </p>
            ) : null}
            <div className={styles.fields}>
              <label>
                라벨 <span>선택 · 쉼표로 구분</span>
                <input
                  value={draft.labels}
                  maxLength={500}
                  placeholder="고객질문, 콘텐츠소재, 사업아이디어"
                  onChange={(e) => update({ labels: e.target.value })}
                />
              </label>
              <label>
                기록 범위
                <select
                  value={draft.scope}
                  onChange={(e) => update({ scope: e.target.value })}
                >
                  <option value="personal">개인</option>
                  <option value="company">회사 업무</option>
                </select>
              </label>
            </div>
            <p>
              Moonlight에 저장합니다. 자동 AI 분석·업무 생성·고객 발송 없음.
              프로젝트와 할 일은 저장 후 연결합니다.
            </p>
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !draft.body.trim() || Boolean(pendingFile)}
              >
                {busy ? "저장 확인 중…" : "메모 저장"}
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
              href={`/dashboard/work/projects?view=memos&memo=note:${encodeURIComponent(savedId)}`}
            >
              저장된 메모 열기
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
