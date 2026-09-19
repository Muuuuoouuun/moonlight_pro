"use client";

// 운영자 로그인. 미들웨어(`middleware.js`)가 세션 없는 접근을 여기로 보낸다.
// 로컬(loopback)에서는 게이트가 통과시키므로 이 화면을 볼 일이 없다 — 배포용이다.

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import "../../components/hub/hub-tokens.css";
import { Button, Card, Input } from "../../components/hub/hub-primitives";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [secret, setSecret] = React.useState("");
  const [state, setState] = React.useState({ status: "idle", message: "" });
  const inputRef = React.useRef(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (!secret.trim() || state.status === "saving") return;
    setState({ status: "saving", message: "확인 중…" });
    try {
      const response = await fetch("/api/operator/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", secret: secret.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.status === "authenticated") {
        setState({ status: "ok", message: "이동합니다…" });
        // replace — 뒤로가기로 로그인 화면에 돌아오지 않게 한다.
        router.replace(next.startsWith("/") ? next : "/dashboard");
        return;
      }
      setSecret("");
      setState({
        status: "error",
        message: data.status === "not-configured"
          ? "서버에 세션 비밀키가 설정되지 않았습니다."
          : "비밀키가 맞지 않습니다.",
      });
      inputRef.current?.focus();
    } catch {
      setState({ status: "error", message: "연결에 실패했습니다. 다시 시도하세요." });
    }
  }

  return (
    <div className="hub-app" data-theme="dark" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 16 }}>
      <Card style={{ width: "min(380px, 100%)", padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--fg)" }}>Moonlight</h1>
        <p style={{ margin: "6px 0 20px", fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
          운영자 비밀키로 로그인하세요.
        </p>

        <form onSubmit={submit} aria-label="운영자 로그인">
          <label htmlFor="operator-secret" className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--fg-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            운영자 비밀키
          </label>
          <Input
            id="operator-secret"
            ref={inputRef}
            type="password"
            value={secret}
            autoComplete="current-password"
            disabled={state.status === "saving"}
            onChange={(value) => {
              setSecret(value);
              if (state.status === "error") setState({ status: "idle", message: "" });
            }}
            style={{ width: "100%" }}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!secret.trim() || state.status === "saving"}
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
