"use client";

// 운영자 로그인. 미들웨어(`middleware.js`)가 세션 없는 접근을 여기로 보낸다.
// 로컬(loopback)에서는 게이트가 통과시키므로 이 화면을 볼 일이 없다 — 배포용이다.

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import "../../components/hub/hub-tokens.css";
import { Button, Card, Input } from "../../components/hub/hub-primitives";

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

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event) {
    event.preventDefault();
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
        // replace — 뒤로가기로 로그인 화면에 돌아오지 않게 한다.
        const target = new URL(next, window.location.origin);
        router.replace(target.origin === window.location.origin
          ? `${target.pathname}${target.search}${target.hash}`
          : "/dashboard");
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
            disabled={state.status === "saving"}
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
            disabled={state.status === "saving"}
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
            disabled={!username.trim() || !password || state.status === "saving"}
            style={{ width: "100%", marginTop: 14 }}
          >
            {state.status === "saving" ? "확인 중" : "로그인"}
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
