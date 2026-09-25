"use client";

// 운영자 로그인. 미들웨어(`middleware.js`)가 세션 없는 접근을 여기로 보낸다.
// 로컬(loopback)에서는 게이트가 통과시키므로 이 화면을 볼 일이 없다 — 배포용이다.

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import "../../components/hub/hub-tokens.css";
import { Button, Card, Input, TextAreaField } from "../../components/hub/hub-primitives";

import {
  COUNCIL_HANDOFF_DRAFT_LIMIT, consumeCouncilDesktopHandoff, createCouncilDraftState,
  reduceCouncilDraft, isCouncilHandoffLoginTarget, councilHandoffLoginPath,
} from "../../components/hub/council-desktop-handoff";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <React.Suspense fallback={null}><LoginForm /></React.Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [state, setState] = React.useState({ status: "idle", message: "" });
  const inputRef = React.useRef(null);
  const passwordRef = React.useRef(null);
  const [handoff, setHandoff] = React.useState(createCouncilDraftState);
  const [handoffNeedsEdit, setHandoffNeedsEdit] = React.useState(false);
  const handoffRef = React.useRef(handoff);
  const updateHandoff = React.useCallback(action => {
    const updated = reduceCouncilDraft(handoffRef.current, action);
    handoffRef.current = updated;
    setHandoff(updated);
  }, []);

  React.useEffect(() => {
    const receive = () => {
      const result = consumeCouncilDesktopHandoff(window);
      if (!result) return;
      if (!isCouncilHandoffLoginTarget(next, window.location.origin)) {
        updateHandoff({ type: 'error', error: 'Council 검토 화면으로 연결된 안건만 가져올 수 있습니다. 데스크톱에서 다시 열어 주세요.' });
      } else if (result.ok) updateHandoff({ type: 'receive', payload: result.payload });
      else updateHandoff({ type: 'error', error: result.error });
    };
    if (!isCouncilHandoffLoginTarget(next, window.location.origin)) {
      handoffRef.current = createCouncilDraftState();
      setHandoff(handoffRef.current);
      setHandoffNeedsEdit(false);
    }
    receive();
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, [next, updateHandoff]);

  function continueToDestination() {
    const current = handoffRef.current;
    // A second handoff can arrive while login is in flight. Keep both until reviewed.
    if (current.pending.length) {
      setState({ status: 'ready', message: '로그인되었습니다. 가져올 안건을 정리한 뒤 계속하세요.' });
      return;
    }
    const councilTarget = current.draft.trim() && councilHandoffLoginPath(next, window.location.origin,
      { version: 1, draft: current.draft, source: current.source || { kind: 'text' } });
    if (current.draft && isCouncilHandoffLoginTarget(next, window.location.origin) && !councilTarget) {
      updateHandoff({ type: 'error', error: '안건을 링크로 전달할 수 없습니다. 특수문자나 내용을 줄인 뒤 다시 계속하세요. 입력한 안건은 그대로 보관 중입니다.' });
      setHandoffNeedsEdit(true);
      setState({ status: 'ready', message: '로그인되었습니다. 안건을 수정한 뒤 계속하세요.' });
      return;
    }
    const target = new URL(next, window.location.origin);
    router.replace(councilTarget || (target.origin === window.location.origin
      ? `${target.pathname}${target.search}${target.hash}` : '/dashboard'));
  }

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (handoffRef.current.pending.length) return;
    if (state.status === 'ready') { continueToDestination(); return; }
    if (!username.trim() || !password || state.status === "saving") return;
    setState({ status: "saving", message: "확인 중…" });
    try {
      const response = await fetch("/api/operator/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.status === "authenticated") {
        setState({ status: "ok", message: "이동합니다…" });
        setPassword("");
        // Only an exact Council destination receives the in-memory draft. No advisor runs here.
        continueToDestination();
        return;
      }
      setPassword("");
      setState({
        status: "error",
        message: data.status === "not-configured"
          ? "서버 로그인 설정이 아직 완료되지 않았습니다."
          : "아이디 또는 비밀번호를 확인하세요.",
      });
      passwordRef.current?.focus();
    } catch {
      setState({ status: "error", message: "연결에 실패했습니다. 다시 시도하세요." });
    }
  }

  return (
    <div className="hub-app" data-theme="dark" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 16 }}>
      <Card style={{ width: "min(380px, 100%)", padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--fg)" }}>Moonlight</h1>
        <p style={{ margin: "6px 0 20px", fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
          아이디와 비밀번호로 로그인하세요.
        </p>

        {(handoff.draft || handoff.error || handoff.pending.length > 0 || handoffNeedsEdit) && (
          <div style={{ marginBottom: 16 }}>
            <p role={handoff.error ? 'alert' : 'status'} style={{ fontSize: 12, lineHeight: 1.5, color: handoff.error ? 'var(--danger)' : 'var(--fg-muted)', margin: '0 0 8px' }}>
              {handoff.error || '데스크톱 안건을 보관 중입니다. 로그인 후 Council에서 검토하세요.'}
            </p>
            {(handoff.pending.length > 0 || handoffNeedsEdit) && (
              <TextAreaField label="가져갈 안건" rows={3} value={handoff.draft} maxLength={COUNCIL_HANDOFF_DRAFT_LIMIT} showCount onChange={event => updateHandoff({ type: 'edit', draft: event.target.value })} />
            )}
            {handoff.pending.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>추가 안건 <span className="num">{handoff.pending.length}</span>건 · 기존 입력을 유지했습니다.</p>
                <p style={{ fontSize: 12, color: 'var(--fg)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflowY: 'auto' }}>{handoff.pending[0].draft}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <Button size="xs" variant="outline" onClick={() => updateHandoff({ type: 'append' })}>기존 입력 뒤에 붙이기</Button>
                  <Button size="xs" variant="ghost" onClick={() => updateHandoff({ type: 'dismiss' })}>이 안건 닫기</Button>
                </div>
              </>
            )}
          </div>
        )}

        <form onSubmit={submit} aria-label="운영자 로그인">
          <label htmlFor="operator-username" style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 6 }}>
            아이디
          </label>
          <Input
            id="operator-username"
            ref={inputRef}
            name="username"
            type="text"
            size="lg"
            value={username}
            autoComplete="username"
            maxLength={128}
            required
            disabled={state.status === "saving" || state.status === "ready"}
            onChange={(value) => {
              setUsername(value);
              if (state.status === "error") setState({ status: "idle", message: "" });
            }}
            style={{ width: "100%" }}
          />
          <label htmlFor="operator-password" style={{ display: "block", fontSize: 11.5, color: "var(--fg-muted)", margin: "16px 0 6px" }}>
            비밀번호
          </label>
          <Input
            id="operator-password"
            ref={passwordRef}
            name="password"
            type={passwordVisible ? "text" : "password"}
            size="lg"
            value={password}
            autoComplete="current-password"
            maxLength={1024}
            required
            disabled={state.status === "saving" || state.status === "ready"}
            onChange={(value) => {
              setPassword(value);
              if (state.status === "error") setState({ status: "idle", message: "" });
            }}
            suffix={<Button type="button" variant="ghost" size="xs" onClick={() => setPasswordVisible((visible) => !visible)}>
              {passwordVisible ? "숨기기" : "보기"}
            </Button>}
            style={{ width: "100%" }}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={handoff.pending.length > 0 || (state.status !== "ready" && (!username.trim() || !password || state.status === "saving"))}
            style={{ width: "100%", marginTop: 14 }}
          >
            {state.status === "saving" ? "확인 중" : state.status === "ready" ? "Council에서 검토" : "로그인"}
          </Button>
        </form>

        <div style={{ marginTop: 10, minHeight: 18 }}>
          <span
            role={state.status === "error" ? "alert" : "status"}
            aria-live="polite"
            style={{ fontSize: 11.5, color: state.status === "error" ? "var(--danger)" : "var(--fg-faint)" }}
          >
            {state.message}
          </span>
        </div>
      </Card>
    </div>
  );
}
