"use client";

import React from "react";
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
} from "../hub-primitives";
import {
  buildBrandDirectory,
  quietLabel,
  selectBrand,
} from "@/lib/brand-directory";
import { createClientId } from "@/lib/pms-ui";

// 브랜드 탭 — 브랜드를 콘텐츠 필터가 아니라 운영 대상으로 다루는 표면
// (2026-08-29 브랜드 탭 설계). P1 범위는 목록 + 정체성(읽기)이며,
// 스케줄·기록·성과 탭은 P3~P5에서 붙는다. 없는 탭을 빈 껍데기로 미리 그리지 않는다.
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

function useContentLedgerForBrands() {
  const [state, setState] = React.useState({ source: "loading", brands: [], items: [], publishLogs: [] });

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, source: "loading" }));
    try {
      const response = await fetch("/api/hub/content", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.status === "error") {
        setState({ source: "error", brands: [], items: [], publishLogs: [] });
        return;
      }
      setState({
        source: data.source === "supabase" ? "supabase" : "preview",
        brands: Array.isArray(data.brands) ? data.brands : [],
        items: Array.isArray(data.items) ? data.items : [],
        publishLogs: Array.isArray(data.publishLogs) ? data.publishLogs : [],
      });
    } catch {
      setState({ source: "error", brands: [], items: [], publishLogs: [] });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { ledger: state, reload: load };
}

function syncStateOf(source) {
  if (source === "supabase") return "live";
  if (source === "loading") return "loading";
  if (source === "error") return "error";
  return "preview";
}

// 발행 리듬 한 줄. "2/3"는 이번 주 발행 / 주당 목표이며, 목표가 cadence에서 유도된
// 권장값이면 CertaintyBadge가 그 사실을 라벨로 말한다 (DESIGN §5.3 — 색이 아니라 라벨).
function RhythmLine({ brand }) {
  const goal = brand.weeklyGoal;
  if (brand.publishedThisWeek == null) {
    return <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>연결 후 표시</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="stat" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
        {brand.publishedThisWeek}
        <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>
          /{goal.value ?? "–"}
        </span>
      </span>
      {goal.certainty === "recommended" && (
        <CertaintyBadge state="recommended" label="권장 목표" />
      )}
      {goal.certainty === "unknown" && (
        <CertaintyBadge state="unknown" label="목표 미정" />
      )}
    </span>
  );
}

// 행 안의 짧은 정체성 라벨. 무엇이 비었는지 전체 목록은 상세에서 읽는다 —
// 행에 "정체성 철학·보이스·콘텐츠 규칙 없음"을 그대로 쓰면 상태 칼럼이 터진다.
function identityRowLabel(identity) {
  return identity.state === "unknown" ? "정체성 미입력" : "정체성 일부";
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
          {brand.description || brand.cadenceLabel}
        </span>
      </span>

      <span className="hub-brand-row__rhythm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
          이번 주
        </span>
        <RhythmLine brand={brand} />
      </span>

      <span className="hub-brand-row__quiet" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
        <span style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
          {brand.publishedThisWeek == null ? "—" : quietLabel(brand.quietDays)}
        </span>
        {brand.counts && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>
            아이디어 {brand.counts.ideas} · 초안 {brand.counts.drafts} · 예약 {brand.counts.scheduled}
          </span>
        )}
      </span>

      <span className="hub-brand-row__state" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {brand.failedPublishes > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--danger)", whiteSpace: "nowrap" }}>
            <Iconed name="flag" size={12} />
            발행 실패 {brand.failedPublishes}건
          </span>
        )}
        {brand.identity.state !== "confirmed" && (
          <CertaintyBadge state={brand.identity.state} label={identityRowLabel(brand.identity)} />
        )}
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

function BrandDetail({ brand, onBack, onOpenStudio, onOpenQueue }) {
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
              이번 주 발행
            </span>
            <RhythmLine brand={brand} />
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              {brand.publishedThisWeek == null ? "" : quietLabel(brand.quietDays)}
            </span>
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
        <SectionTitle
          subtitle="AI 브랜드 멘토가 읽는 것과 같은 원본이다. 편집은 다음 단계에서 열린다."
          right={brand.identity.state !== "confirmed"
            ? <CertaintyBadge state={brand.identity.state} label={`${brand.identity.missing.join("·")} 없음`} />
            : <CertaintyBadge state="confirmed" label="정체성 확정" />}
        >
          정체성
        </SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)", marginTop: 14 }}>
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
          <ChipBlock label="키워드" items={brand.keywords} placeholder="키워드가 없습니다" />
          <ListBlock label="콘텐츠 규칙" items={brand.rules} placeholder="규칙이 없습니다 · 이 브랜드에서 반드시 지킬 것" />
          <ListBlock label="금지어 · 하지 않을 것" items={brand.forbidden} placeholder="금지 목록이 없습니다" />
          <ChipBlock label="채널" items={brand.channels} placeholder="연결된 채널이 없습니다" />
          <ListBlock label="링크" items={brand.sourceLinks} placeholder="등록된 링크가 없습니다" mono />
        </div>
      </Card>

      <Card>
        <SectionTitle subtitle="이 브랜드의 콘텐츠는 제작소가 정본이다.">콘텐츠</SectionTitle>
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
              콘텐츠 원장이 연결되면 이 브랜드의 아이디어·초안·예약·발행 수가 표시됩니다.
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" icon="queue" onClick={() => onOpenQueue(brand.key)}>큐에서 보기</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => onOpenStudio(brand.key)}>이 브랜드로 새 콘텐츠</Button>
        </div>
      </Card>

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
  const { ledger, reload } = useContentLedgerForBrands();
  const [draft, setDraft] = React.useState(null);
  const [saveNote, setSaveNote] = React.useState(null);

  const directory = React.useMemo(
    () => buildBrandDirectory(ledger, { scope }),
    [ledger, scope],
  );
  const selected = selectBrand(directory, selectedKey);
  const syncState = syncStateOf(ledger.source);

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
      if (draft) return;
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
  }, [createBrand, draft]);

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
              : `${directory.brands.length}개${scopeSuffix} · 정체성 · 리듬 · 기록`}
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

      {selectedKey && !selected && syncState !== "loading" && (
        <Card>
          <EmptyState
            icon="brand"
            title="이 브랜드를 찾지 못했습니다"
            description={`'${selectedKey}'는 현재 스코프에 없거나 더 이상 존재하지 않습니다.`}
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
                ["목표 미달", totals.behind],
                ["2주 이상 조용", totals.quiet],
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
                <span className="hub-brand-row__rhythm" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>발행 / 목표</span>
                <span className="hub-brand-row__quiet" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", textAlign: "right" }}>
                  마지막 발행 · 대기
                </span>
                <span className="hub-brand-row__state" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", textAlign: "right" }}>상태</span>
              </div>
            )}
            {syncState === "loading" && (
              <EmptyState icon="brand" title="브랜드를 읽는 중입니다" description="콘텐츠 원장에서 브랜드 정체성과 발행 기록을 확인하고 있습니다." style={{ minHeight: 200 }} />
            )}
            {syncState === "error" && (
              <EmptyState
                icon="brand"
                title="브랜드를 읽지 못했습니다"
                description="콘텐츠 원장을 다시 확인해 주세요."
                action={<Button variant="secondary" size="sm" onClick={reload}>다시 읽기</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {syncState === "preview" && directory.brands.length === 0 && (
              <EmptyState
                icon="brand"
                title="Preview · 연결 필요"
                description="Supabase 콘텐츠 원장을 연결하면 실제 브랜드와 발행 기록만 표시됩니다."
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

      {draft && (
        <EditDrawer
          title="새 브랜드"
          subtitle="정체성은 만든 뒤 이 탭에서 채운다"
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
