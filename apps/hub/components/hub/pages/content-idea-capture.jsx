"use client";

import React from "react";
import { Button, TextAreaField, TextField } from "../hub-primitives";
import { refreshContentLedger } from "../use-content-ledger";

export function ContentIdeaCapture({ brands = [], initialBrand = "", orgScope = "personal", fixedScope = false, onSaved }) {
  const [body, setBody] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [brandId, setBrandId] = React.useState(initialBrand);
  const [scope, setScope] = React.useState(orgScope);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState(false);
  const attempt = React.useRef(null);

  React.useEffect(() => { setBrandId(initialBrand); }, [initialBrand]);

  async function capture(event) {
    event.preventDefault();
    if (busy || (!body.trim() && !sourceUrl.trim())) return;
    setBusy(true);
    setError(false);
    setMessage("소재를 저장하고 있습니다…");
    // Keep the exact command on ambiguous failure so retries cannot duplicate it.
    attempt.current ||= {
      action: "idea", contentId: crypto.randomUUID(), variantId: crypto.randomUUID(),
      body: body, sourceUrl: sourceUrl.trim() || undefined, brandId: brandId || undefined,
      orgScope: brandId ? (['company', 'classin'].includes(brands.find((brand) => brand.id === brandId)?.orgScope) ? 'company' : 'personal') : scope,
    };
    try {
      const response = await fetch("/api/hub/content", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(attempt.current),
      });
      const result = await response.json();
      if (!response.ok || !["saved", "duplicate"].includes(result.status)) {
        if (response.status === 400) attempt.current = null;
        throw new Error(result.status === "preview" ? "저장소가 연결되지 않아 소재를 저장하지 않았습니다." : result.error || "소재를 저장하지 못했습니다.");
      }
      const refreshed = await refreshContentLedger();
      const id = result.contentId || attempt.current.contentId;
      if (refreshed.source !== "supabase" || !refreshed.items.some((item) => item.id === id)) {
        throw new Error("저장 응답을 받았지만 목록에서 확인하지 못했습니다. 같은 소재로 다시 확인해 주세요.");
      }
      attempt.current = null;
      setBody(""); setSourceUrl("");
      setMessage("소재함에 저장했습니다. 준비되면 원고를 이어 쓰세요.");
      onSaved?.(id);
    } catch (cause) {
      setError(true); setMessage(cause.message || "소재를 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={capture} style={{ padding: 18, border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", background: "var(--surface)", display: "grid", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 550 }}>떠오른 소재부터 담기</div>
      <TextAreaField
        label="소재 메모"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={busy || Boolean(attempt.current)}
        placeholder="지금 말하고 싶은 한 가지, 기억할 문장…"
        rows={3}
        spacious
        autoResize
        onCmdEnter={capture}
      />
      <TextField label="참고 링크 (선택)" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} disabled={busy || Boolean(attempt.current)} placeholder="https://" />
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        {!brandId && !fixedScope && <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--fg-muted)' }}>기록 범위<select aria-label="소재 기록 범위" value={scope} onChange={(event) => setScope(event.target.value)} disabled={busy || Boolean(attempt.current)} style={{ minHeight: 40, color: 'var(--fg)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }}><option value="personal">개인</option><option value="company">회사</option></select></label>}
        <label style={{ display: "grid", gap: 5, fontSize: 12, color: "var(--fg-muted)", flex: "1 1 180px" }}>
          브랜드 (나중에 선택 가능)
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)} disabled={busy || Boolean(attempt.current)} style={{ minHeight: 40, color: "var(--fg)", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
            <option value="">미지정</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || (!body.trim() && !sourceUrl.trim())}>{busy ? "저장 중…" : attempt.current ? "같은 소재로 재시도" : "소재 저장"}</Button>
      </div>
      {message && <div role={error ? "alert" : "status"} style={{ fontSize: 12, color: error ? "var(--danger)" : "var(--fg-muted)" }}>{message}</div>}
    </form>
  );
}
