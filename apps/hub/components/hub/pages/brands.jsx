"use client";

import React from "react";
import { RelatedMemos } from '../related-memos';
import { MemoCaptureLink } from "../journal-links";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Iconed } from "../hub-icons";
import {
  Button,
  Card,
  CertaintyBadge,
  EditDrawer,
  EmptyState,
  Kbd,
  SectionTitle,
  SyncBadge,
  useToast,
  Skeleton,
} from "../hub-primitives";
import {
  buildBrandDirectory,
  selectBrand,
} from "@/lib/brand-directory";
import { createClientId } from "@/lib/pms-ui";
import { BRAND_IDENTITY_FIELDS, BRAND_OPERATING_STATES, brandIdentityDraft, brandIdentityPayload } from "@/lib/brand-identity";

// 브랜드 탭 — 브랜드를 콘텐츠 필터가 아니라 운영 대상으로 다루는 표면
// 방향과 표현 기준은 brands.meta에 저장하고 콘텐츠 작업은 공통 보기로 연결한다.
//
// 목록 ⇄ 상세는 같은 라우트의 두 상태다 (`?b=<slug>`). aside 레일을 쓰지 않는 이유는
// 모바일에서 `.hub-workspace-shell > aside`가 통째로 숨겨져 브랜드를 바꿀 방법이
// 사라지기 때문이다 — PMS는 헤더 드롭다운으로 보완하지만 여기서는 상태 전환이 더 맞다.

const SCOPE_LABEL = { classin: "ClassIn", personal: "개인" };

// 컨테이너 slug 규칙은 PMS와 같아야 한다 — 같은 brands 테이블의 unique(workspace, slug)다.
function slugifyBrand(name, id) {
  const base = String(name || "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `b-${String(id || "").slice(0, 8)}`;
}

function useBrandLedger() {
  const [state, setState] = React.useState({ source: "loading", brands: [], items: [], publishLogs: [] });

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, source: "loading" }));
    try {
      const response = await fetch("/api/hub/brands", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.status === "error") {
        setState({ source: "error", brands: [], items: [], publishLogs: [] });
        return;
      }
      setState({
        source: data.source === "supabase" ? "supabase" : "preview",
        // Truncated reads remain partial rather than implying the directory is complete.
        partial: data.source === "supabase" && data.status === "partial",
        brands: Array.isArray(data.brands) ? data.brands : [],
        items: Array.isArray(data.items) ? data.items : [],
        publishLogs: Array.isArray(data.publishLogs) ? data.publishLogs : [],
        metricsAvailable: data.metricsAvailable,
      });
      return data;
    } catch {
      setState({ source: "error", brands: [], items: [], publishLogs: [] });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { ledger: state, reload: load };
}

function syncStateOf(source, partial = false) {
  if (source === "supabase") return partial ? "partial" : "live";
  if (source === "loading") return "loading";
  if (source === "error") return "error";
  return "preview";
}

// 행 안의 짧은 정체성 라벨. 무엇이 비었는지 전체 목록은 상세에서 읽는다 —
// 행에 "정체성 철학·보이스·콘텐츠 규칙 없음"을 그대로 쓰면 상태 칼럼이 터진다.
function identityRowLabel(identity) {
  return identity.state === "confirmed" ? "기준 확인됨" : identity.complete ? "작성됨 · 미확인" : identity.state === "unknown" ? "기준 미입력" : "일부 작성됨";
}

function BrandRow({ brand, onOpen }) {
  const open = () => onOpen(brand.key);
  return (
    <div
      className="hub-row hub-brand-row"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      }}
      style={{
        padding: "12px 16px", borderBottom: "1px solid var(--line-soft)",
        cursor: "pointer",
        // 발행 실패만 danger 레일을 받는다 — 조용함은 손실이 아니다 (설계 §6).
        boxShadow: brand.failedPublishes > 0 ? "inset 1px 0 0 var(--danger)" : undefined,
      }}
    >
      <span style={{ fontSize: 15, color: "var(--fg-muted)", textAlign: "center" }} aria-hidden="true">
        {brand.glyph || "○"}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: "var(--fg)" }}>
          {brand.name}
        </span>
        <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {brand.promise || brand.description || "핵심 약속을 정해보세요"}
        </span>
      </span>

      <span className="hub-brand-row__rhythm" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
        {brand.isFocused ? "집중 브랜드 · " : ""}{BRAND_OPERATING_STATES.find((s) => s.value === brand.operatingState)?.label || "운영 상태 미정"}
      </span>
      <span className="hub-brand-row__quiet" style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {brand.currentFocus || "현재 집중점을 정해보세요"}
      </span>

      <span className="hub-brand-row__state" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {brand.failedPublishes > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--danger)", whiteSpace: "nowrap" }}>
            <Iconed name="flag" size={12} />
            발행 실패 {brand.failedPublishes}건
          </span>
        )}
        <CertaintyBadge state={brand.identity.state} label={identityRowLabel(brand.identity)} />
      </span>
    </div>
  );
}

function TextBlock({ label, value, placeholder }) {
  const filled = Boolean(String(value || "").trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
        {label}
      </span>
      <p style={{
        margin: 0, fontSize: 13, lineHeight: 1.65,
        color: filled ? "var(--fg)" : "var(--fg-dim)",
      }}>
        {filled ? value : placeholder}
      </p>
    </div>
  );
}

function ListBlock({ label, items, placeholder, mono = false }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
        {label}
      </span>
      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg-dim)" }}>{placeholder}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((entry, index) => (
            <li key={`${entry}-${index}`} className={mono ? "mono" : undefined} style={{ fontSize: mono ? 12 : 13, lineHeight: 1.6, color: "var(--fg-muted)" }}>
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipBlock({ label, items, placeholder }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
        {label}
      </span>
      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg-dim)" }}>{placeholder}</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {list.map((entry, index) => (
            <span key={`${entry}-${index}`} style={{
              fontSize: 12, color: "var(--fg-muted)",
              padding: "3px 9px", borderRadius: 999,
              border: "1px solid var(--line-soft)", background: "var(--surface-2)",
            }}>{entry}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandDetail({ brand, onBack, onOpenStudio, onOpenQueue, onEdit }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, color: "var(--fg-muted)" }} aria-hidden="true">{brand.glyph || "○"}</span>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--fg)" }}>{brand.name}</div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--fg-muted)" }}>
              {brand.description || "설명 없음"}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            {brand.isFocused ? "집중 브랜드 · " : ""}{BRAND_OPERATING_STATES.find((s) => s.value === brand.operatingState)?.label || "운영 상태 미정"}
          </div>
        </div>
        {brand.failedPublishes > 0 && (
          // 발행 실패는 목록에서만이 아니라 상세에서도 보여야 한다 — 브랜드를 열고도
          // 실패를 못 보면 목록의 붉은 레일이 설명되지 않는다.
          <div style={{
            marginTop: 12, padding: "9px 12px",
            border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)",
            boxShadow: "inset 1px 0 0 var(--danger)",
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12.5, color: "var(--danger)",
          }}>
            <Iconed name="flag" size={13} />
            발행 실패 {brand.failedPublishes}건 · 발행 로그에서 원인을 확인하세요
          </div>
        )}
      </Card>

      <Card>
        <TextBlock label="현재 집중점" value={brand.currentFocus} placeholder="이번에 쌓거나 검증할 한 가지를 정해보세요." />
      </Card>
      <Card>
        <SectionTitle
          subtitle="무엇을 만들지 판단할 때 함께 읽는 브랜드 기준입니다. 빈칸이 있어도 저장할 수 있습니다."
          right={<Button variant="secondary" size="sm" onClick={onEdit}>브랜드 기준 편집</Button>}
        >
          방향과 표현 기준
        </SectionTitle>
        <CertaintyBadge state={brand.identity.state} label={identityRowLabel(brand.identity)} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)", marginTop: 14 }}>
          <TextBlock label="대상" value={brand.audience} placeholder="누구의 어떤 문제와 욕구를 다룰지" />
          <TextBlock label="핵심 약속" value={brand.promise} placeholder="이 브랜드를 만나고 무엇이 달라질지" />
          <TextBlock label="제공하는 가치" value={brand.offer} placeholder="상품·서비스·작품·경험" />
          <TextBlock label="철학" value={brand.philosophy} placeholder="아직 비어 있습니다 · 이 브랜드가 왜 존재하는지" />
          <TextBlock label="방향" value={brand.direction} placeholder="아직 비어 있습니다 · 어떤 형태로 쌓아갈지" />
          <TextBlock label="보이스" value={brand.voice} placeholder="아직 비어 있습니다 · 어떤 언어로 말할지" />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
              발행 리듬
            </span>
            <span style={{ fontSize: 13, color: "var(--fg)" }}>
              {brand.cadenceLabel}
              {brand.weeklyGoal.value != null && (
                <span style={{ color: "var(--fg-muted)" }}>
                  {" · 주 "}{brand.weeklyGoal.value}건
                  {brand.weeklyGoal.certainty === "recommended" ? " (권장)" : ""}
                </span>
              )}
            </span>
          </div>
          <TextBlock label="좋은 표현 예시" value={brand.voiceExamples} placeholder="이 브랜드다운 실제 문장" />
          <ChipBlock label="핵심 주제" items={brand.keywords} placeholder="키워드가 없습니다" />
          <ListBlock label="콘텐츠 규칙" items={brand.rules} placeholder="규칙이 없습니다 · 이 브랜드에서 반드시 지킬 것" />
          <ListBlock label="금지어 · 하지 않을 것" items={brand.forbidden} placeholder="금지 목록이 없습니다" />
          <ChipBlock label="채널" items={brand.channels} placeholder="연결된 채널이 없습니다" />
          <ListBlock label="링크" items={brand.sourceLinks} placeholder="등록된 링크가 없습니다" mono />
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="소재 선택과 이어쓰기는 이 브랜드로 필터한 콘텐츠 보기에서 이어갑니다.">콘텐츠</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
          {brand.counts ? (
            <>
              {[
                ["아이디어", brand.counts.ideas],
                ["초안·검토", brand.counts.drafts],
                ["예약", brand.counts.scheduled],
                ["발행", brand.counts.published],
              ].map(([label, value]) => (
                <span key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{label}</span>
                  <span className="stat" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>{value}</span>
                </span>
              ))}
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--fg-dim)" }}>
              소재와 초안, 발행 기록을 함께 확인하세요.
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" icon="queue" onClick={() => onOpenQueue(brand.key)}>소재·원고 보기</Button>
          <MemoCaptureLink context={{ type: "brand", id: brand.id }} />
          <Button variant="primary" size="sm" icon="plus" onClick={() => onOpenStudio(brand.key)}>이 브랜드로 새 콘텐츠</Button>
        </div>
      </Card>

      <Card><RelatedMemos type="brand" id={brand.id} /></Card>

      <div>
        <Button variant="ghost" size="sm" icon="chevronL" onClick={onBack}>브랜드 목록</Button>
      </div>
    </div>
  );
}

export function Brands() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") || "all";
  const selectedKey = searchParams.get("b");
  const { ledger, reload } = useBrandLedger();
  const toast = useToast();
  const [draft, setDraft] = React.useState(null);
  const [saveNote, setSaveNote] = React.useState(null);
  const [identityDraft, setIdentityDraft] = React.useState(null);

  const directory = React.useMemo(
    () => buildBrandDirectory(ledger, { scope }),
    [ledger, scope],
  );
  const selected = selectBrand(directory, selectedKey);
  const syncState = syncStateOf(ledger.source, ledger.partial);

  const setQuery = React.useCallback((next) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next == null) params.delete("b");
    else params.set("b", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const openStudio = React.useCallback((key) => {
    router.push(`/dashboard/content/studio?new=draft&brand=${encodeURIComponent(key)}`);
  }, [router]);
  const openQueue = React.useCallback((key) => {
    router.push(`/dashboard/content/queue?brand=${encodeURIComponent(key)}`);
  }, [router]);
  const openContentLog = React.useCallback(() => {
    router.push("/dashboard/brands/log");
  }, [router]);

  const createBrand = React.useCallback(() => {
    setSaveNote(null);
    setDraft({
      isNew: true,
      id: createClientId(),
      name: "",
      // 브랜드 탭에서 만든 브랜드는 브랜드 소유 분류로 들어가 PMS 트리를 채우지 않는다.
      category: "sns-channel",
      orgScope: scope === "classin" ? "classin" : "personal",
    });
  }, [scope]);

  // 페이지 레벨 N — 드로어가 닫혀 있고 포커스가 입력 밖일 때만 (DESIGN §8.1).
  React.useEffect(() => {
    const onKey = (event) => {
      if (draft || identityDraft) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      event.preventDefault();
      createBrand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createBrand, draft, identityDraft]);

  const persistBrand = React.useCallback(async () => {
    const name = draft?.name?.trim();
    if (!name) return { ok: false, status: "invalid-input" };
    const slug = slugifyBrand(name, draft.id);

    try {
      const response = await fetch("/api/hub/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name,
          slug,
          category: draft.category,
          orgScope: draft.orgScope,
          source: "hub-brands",
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && ["saved", "duplicate"].includes(data.status)) {
        await reload();
        setQuery(slug);
        setSaveNote({ tone: "ok", label: "브랜드 저장됨" });
        toast.success(`새 브랜드 ‘${name}’을 만들었습니다.`);
        return { ok: true, status: data.status };
      }
      if (data.status === "preview") {
        // Engine 미설정 — 저장되지 않은 브랜드를 목록에 그리지 않는다.
        setSaveNote({ tone: "warn", label: "Engine 미설정 · 저장되지 않았습니다" });
        return { ok: true, status: "preview" };
      }
      setSaveNote({ tone: "err", label: data.error || `저장 실패 ${response.status}` });
      return { ok: false, status: data.status || "error" };
    } catch (error) {
      setSaveNote({ tone: "err", label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: "error" };
    }
  }, [draft, reload, setQuery]);

  const persistIdentity = async () => {
    const payload = brandIdentityPayload(identityDraft);
    try {
      const response = await fetch("/api/hub/brands", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "saved") {
        setSaveNote({ tone: "err", label: data.status === "conflict" ? "다른 변경이 먼저 저장되었습니다. 입력을 보관하고 브랜드를 다시 열어주세요." : data.status === "preview" ? "저장 연결이 없어 입력을 유지했습니다." : data.error || "브랜드 기준 저장 실패" });
        return { ok: false, status: data.status || "error" };
      }
      if (data.brand?.updated_at) setIdentityDraft((current) => ({ ...current, expectedUpdatedAt: data.brand.updated_at }));
      const latest = await reload();
      const saved = latest?.brands?.find((brand) => brand.id === payload.id);
      const matches = saved && Object.entries(payload.identity).every(([key, value]) => JSON.stringify(saved[key]) === JSON.stringify(value))
        && saved.operatingState === payload.operatingState && saved.isFocused === payload.isFocused
        && Boolean(saved.identityConfirmedAt) === payload.confirmIdentity;
      if (!matches) {
        setSaveNote({ tone: "err", label: "저장 응답을 받았지만 재조회 확인에 실패했습니다. 입력을 유지합니다." });
        return { ok: false, status: "error" };
      }
      window.dispatchEvent(new Event("hub:brand-updated"));
      setSaveNote({ tone: "ok", label: "브랜드 기준 저장 · 재조회 확인됨" });
      return { ok: true, status: "saved" };
    } catch {
      setSaveNote({ tone: "err", label: "브랜드 기준을 저장하지 못했습니다. 입력을 유지합니다." });
      return { ok: false, status: "error" };
    }
  };

  const scopeSuffix = SCOPE_LABEL[scope] ? ` · ${SCOPE_LABEL[scope]}` : "";
  const totals = directory.totals;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>브랜드</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {selected
              ? `${selected.name} · 정체성`
              : `${directory.brands.length}개${scopeSuffix} · 방향 · 집중점 · 자산`}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {saveNote && (
          <span className="mono" style={{
            fontSize: 10.5, whiteSpace: "nowrap",
            color: saveNote.tone === "ok" ? "var(--fg-muted)" : saveNote.tone === "err" ? "var(--danger)" : "var(--fg-dim)",
          }}>{saveNote.label}</span>
        )}
        <Button variant="secondary" size="sm" onClick={openContentLog}>
          컨텐츠 로그
        </Button>
        <Button variant="primary" size="sm" icon="plus" onClick={createBrand}>
          브랜드 <Kbd>N</Kbd>
        </Button>
      </div>

      {/* "찾지 못함"은 라이브 기록을 실제로 읽었을 때만 말할 수 있다 — read 실패·미연결을
          부재로 위장하면 딥링크가 멀쩡한 브랜드를 없다고 단정한다 (2609 감사 #3). */}
      {selectedKey && !selected && (syncState === "live" || syncState === "partial") && (
        <Card>
          <EmptyState
            icon="brand"
            title="이 브랜드를 찾지 못했습니다"
            description={`'${selectedKey}'는 현재 스코프에 없거나 더 이상 존재하지 않습니다.`}
            action={<Button variant="secondary" size="sm" onClick={() => setQuery(null)}>브랜드 목록으로</Button>}
          />
        </Card>
      )}
      {selectedKey && !selected && syncState === "error" && (
        <Card>
          <EmptyState
            icon="brand"
            title="브랜드를 읽지 못했습니다"
            description={`브랜드 기록을 읽지 못해 '${selectedKey}'를 확인할 수 없습니다 — 없는 것이 아니라 읽기 실패입니다.`}
            action={<Button variant="secondary" size="sm" onClick={reload}>다시 읽기</Button>}
          />
        </Card>
      )}
      {selectedKey && !selected && syncState === "preview" && (
        <Card>
          <EmptyState
            icon="brand"
            title="Preview · 연결 필요"
            description={`Supabase 브랜드 기록이 연결되지 않아 '${selectedKey}'를 확인할 수 없습니다.`}
            action={<Button variant="secondary" size="sm" onClick={() => setQuery(null)}>브랜드 목록으로</Button>}
          />
        </Card>
      )}

      {selected && (
        <BrandDetail
          brand={selected}
          onBack={() => setQuery(null)}
          onOpenStudio={openStudio}
          onOpenQueue={openQueue}
          onEdit={() => { setSaveNote(null); setIdentityDraft(brandIdentityDraft(selected)); }}
        />
      )}

      {!selectedKey && (
        <>
          {totals && (
            <div style={{
              display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
              padding: "12px 16px", border: "1px solid var(--line-soft)",
              borderRadius: "var(--r-lg)", background: "var(--surface)",
            }}>
              {[
                ["브랜드", totals.brands],
                ["집중 브랜드", totals.focused],
                ["기준 확인됨", totals.confirmed],
                ["휴식중", totals.resting],
              ].map(([label, value]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{label}</span>
                  <span className="stat" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>{value}</span>
                </span>
              ))}
              {totals.failedPublishes > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--danger)" }}>
                  <Iconed name="flag" size={13} />
                  발행 실패 {totals.failedPublishes}건
                </span>
              )}
            </div>
          )}

          <Card pad={false} className="hub-table-card">
            {directory.brands.length > 0 && (
              <div className="hub-brand-row hub-brand-row--head" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                <span aria-hidden="true" />
                <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>브랜드</span>
                <span className="hub-brand-row__rhythm" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>운영 상태</span>
                <span className="hub-brand-row__quiet" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", textAlign: "right" }}>
                  현재 집중점
                </span>
                <span className="hub-brand-row__state" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", textAlign: "right" }}>상태</span>
              </div>
            )}
            {syncState === "loading" && (
              <Skeleton lines={4} height={44} gap={10} label="브랜드를 읽는 중" style={{ padding: "12px 16px" }} />
            )}
            {syncState === "error" && (
              <EmptyState
                icon="brand"
                title="브랜드를 읽지 못했습니다"
                description="브랜드 기록을 다시 확인해 주세요."
                action={<Button variant="secondary" size="sm" onClick={reload}>다시 읽기</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {syncState === "preview" && directory.brands.length === 0 && (
              <EmptyState
                icon="brand"
                title="Preview · 연결 필요"
                description="Supabase 브랜드 기록을 연결하면 실제 브랜드와 발행 기록만 표시됩니다."
                style={{ minHeight: 200 }}
              />
            )}
            {syncState === "live" && directory.brands.length === 0 && (
              <EmptyState
                icon="brand"
                title={scope === "all" ? "아직 브랜드가 없습니다" : `${SCOPE_LABEL[scope]} 스코프에 브랜드가 없습니다`}
                description="브랜드를 만들면 정체성·발행 리듬·기록이 한 곳에 모입니다."
                action={<Button variant="primary" size="sm" icon="plus" onClick={createBrand}>첫 브랜드 만들기</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {directory.brands.map((brand) => (
              <BrandRow key={brand.key} brand={brand} onOpen={setQuery} />
            ))}
          </Card>
        </>
      )}

      {identityDraft && (
        <EditDrawer title="브랜드 기준 편집" subtitle="빈칸은 나중에 채워도 됩니다. 저장할 때 확인 여부를 직접 선택하세요."
          width="min(560px, 96vw)" record={identityDraft}
          fields={[
            { key: "operatingState", label: "운영 상태", type: "select", options: BRAND_OPERATING_STATES },
            { key: "isFocused", label: "집중 브랜드로 고정", type: "select", options: [{ value: "no", label: "일반" }, { value: "yes", label: "집중 브랜드" }] },
            ...BRAND_IDENTITY_FIELDS.map(([key, label, placeholder]) => ({ key, label, placeholder, type: "textarea" })),
            { key: "confirmation", label: "현재 기준 확인", type: "select", options: [{ value: "unconfirmed", label: "작성만 저장 · 미확인" }, { value: "confirmed", label: "이 내용을 브랜드 기준으로 확인함" }] },
          ]}
          onChange={(key, value) => setIdentityDraft((current) => ({ ...current, [key]: value }))}
          onSave={persistIdentity} saveLabel="브랜드 기준 저장" onClose={() => setIdentityDraft(null)}
        />
      )}
      {draft && (
        <EditDrawer
          title="새 브랜드"
          subtitle="정체성은 만든 뒤 이 탭에서 채운다"
          presentation="compact"
          width="440px"
          record={draft}
          fields={[
            { key: "name", label: "이름", placeholder: "예: 시나브로 · Go;Re" },
            {
              key: "orgScope",
              label: "소속",
              type: "select",
              options: [
                { value: "personal", label: "개인" },
                { value: "classin", label: "업무 · 클래스인" },
              ],
            },
          ]}
          onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
          onSave={persistBrand}
          saveLabel="브랜드 만들기"
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
