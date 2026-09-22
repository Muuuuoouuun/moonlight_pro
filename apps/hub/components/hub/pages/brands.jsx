"use client";

import React from "react";
import { RelatedMemos } from '../related-memos';
import { GoalLinks } from '../goal-links';
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
  ScrollShadowX,
  SegmentedControl,
  SelectField,
  SyncBadge,
  TextField,
  useToast,
  Skeleton,
} from "../hub-primitives";
import {
  buildBrandDirectory,
  selectBrand,
} from "@/lib/brand-directory";
import { createClientId } from "@/lib/pms-ui";
import { BRAND_VIEW_FILTERS, filterBrandDirectory } from "./brand-directory-view";
import "./brands.css";
import { BRAND_IDENTITY_FIELDS, BRAND_OPERATING_STATES, brandIdentityDraft, brandIdentityPayload } from "@/lib/brand-identity";

// 브랜드 탭 — 브랜드를 콘텐츠 필터가 아니라 운영 대상으로 다루는 표면
// 방향과 표현 기준은 brands.meta에 저장하고 콘텐츠 작업은 공통 보기로 연결한다.
//
// 목록 ⇄ 상세는 같은 라우트의 두 상태다 (`?b=<slug>`). 상세의 기본 select로
// 모바일·키보드에서도 브랜드를 바꾸고, 목록으로 돌아오면 검색/필터를 유지한다.

const SCOPE_LABEL = { classin: "ClassIn", personal: "개인" };
const IDENTITY_GROUPS = [
  { key: "value", label: "대상과 가치", icon: "user", fields: ["audience", "promise", "offer"], description: "누구에게 어떤 변화를 줄 브랜드인지 정해보세요." },
  { key: "direction", label: "방향과 주제", icon: "flag", fields: ["philosophy", "direction", "keywords"], description: "반복해서 전할 관점과 쌓아갈 주제를 적어보세요." },
  { key: "voice", label: "표현 기준", icon: "edit", fields: ["voice", "voiceExamples", "rules", "forbidden"], description: "브랜드다운 문장과 지켜야 할 표현 규칙을 남겨보세요." },
];
const IDENTITY_FIELD_LABELS = Object.fromEntries(BRAND_IDENTITY_FIELDS.map(([key, label]) => [key, label]));
const hasIdentityValue = (value) => Array.isArray(value)
  ? value.some((entry) => String(entry).trim())
  : Boolean(String(value || "").trim());

function identityEditorFields(section) {
  const group = IDENTITY_GROUPS.find(({ key }) => key === section);
  const visibleKeys = group?.fields || (section === "focus" ? ["currentFocus"] : null);
  return [
    ...BRAND_IDENTITY_FIELDS.filter(([key]) => !visibleKeys || visibleKeys.includes(key))
      .map(([key, label, placeholder]) => ({ key, label, placeholder, type: "textarea", rows: key === "voiceExamples" ? 4 : 3 })),
    ...(!group ? [
      { key: "operatingState", label: "운영 상태", type: "select", options: BRAND_OPERATING_STATES, row: "operation" },
      { key: "isFocused", label: "집중 브랜드로 고정", type: "select", options: [{ value: "no", label: "일반" }, { value: "yes", label: "집중 브랜드" }], row: "operation" },
    ] : []),
    { key: "confirmation", label: "브랜드 기준 전체 확인", type: "select", options: [{ value: "unconfirmed", label: "작성만 저장 · 미확인" }, { value: "confirmed", label: "브랜드 기준 전체를 확인함" }] },
  ];
}

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
    <div className="brand-fact">
      <span className="brand-fact-label">{label}</span>
      <p className={filled ? "brand-fact-value" : "brand-fact-empty"}>{filled ? value : placeholder}</p>
    </div>
  );
}

function ListBlock({ label, items, placeholder }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="brand-fact">
      <span className="brand-fact-label">{label}</span>
      {list.length === 0 ? <p className="brand-fact-empty">{placeholder}</p> : (
        <ul className="brand-fact-list">
          {list.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
        </ul>
      )}
    </div>
  );
}

function ChipBlock({ label, items, placeholder }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="brand-fact">
      <span className="brand-fact-label">{label}</span>
      {list.length === 0 ? <p className="brand-fact-empty">{placeholder}</p> : (
        <div className="brand-chips">
          {list.map((entry, index) => <span key={`${entry}-${index}`}>{entry}</span>)}
        </div>
      )}
    </div>
  );
}

function BrandSourceLinks({ items }) {
  return (
    <div className="brand-fact">
      <span className="brand-fact-label">링크</span>
      <div className="brand-source-links">
        {items.map((entry, index) => {
          let url;
          try { url = new URL(entry); } catch { /* 이전 기록의 일반 텍스트도 보존한다. */ }
          if (!url || !["http:", "https:"].includes(url.protocol)) return <span key={index}>{entry}</span>;
          const label = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
          return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer" title={url.href} aria-label={`${label} (새 탭)`}><Iconed name="link" size={13} /><span>{label}</span></a>;
        })}
      </div>
    </div>
  );
}

function IdentityGroup({ group, brand, onEdit }) {
  const filledKeys = group.fields.filter((key) => hasIdentityValue(brand[key]));
  const missingKeys = group.fields.filter((key) => !hasIdentityValue(brand[key]));
  const title = <h4 id={`brand-group-${group.key}`}>{group.label}</h4>;
  const action = <Button variant="ghost" size="sm" icon={filledKeys.length ? "edit" : "plus"} aria-label={`${group.label} ${filledKeys.length ? "편집" : "작성"}`} onClick={() => onEdit(group.key)}>{filledKeys.length ? "편집" : "작성"}</Button>;
  return (
    <section className="brand-criteria-group" aria-labelledby={`brand-group-${group.key}`}>
      {filledKeys.length === 0 ? (
        <div className="brand-criteria-empty">
          <EmptyState icon={group.icon} title={title} description={group.description} action={action}
            style={{ minHeight: 0, padding: 0, display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", gap: "4px 12px", textAlign: "left", alignItems: "center" }} />
        </div>
      ) : (
        <>
          <div className="brand-group-heading">{title}{action}</div>
          <div className="brand-identity-grid">
            {filledKeys.map((key) => key === "keywords"
              ? <ChipBlock key={key} label={IDENTITY_FIELD_LABELS[key]} items={brand[key]} />
              : ["rules", "forbidden"].includes(key)
                ? <ListBlock key={key} label={IDENTITY_FIELD_LABELS[key]} items={brand[key]} />
                : <TextBlock key={key} label={IDENTITY_FIELD_LABELS[key]} value={brand[key]} />)}
          </div>
          {missingKeys.length > 0 && <p className="brand-missing-fields">미작성 · {missingKeys.map((key) => IDENTITY_FIELD_LABELS[key]).join(" · ")}</p>}
        </>
      )}
    </section>
  );
}

function BrandDetail({ brand, onOpenStudio, onOpenQueue, onEdit }) {
  const hasPublishingInfo = hasIdentityValue(brand.cadence) || brand.weeklyGoal.value != null || hasIdentityValue(brand.channels) || hasIdentityValue(brand.sourceLinks);
  return (
    <div className="brand-detail">
      {brand.description && <p className="brand-description">{brand.description}</p>}
      <div className="brand-focus-bar">
        <div className="brand-focus-main">
          <TextBlock label={<><span>현재 집중점</span><Button variant="ghost" size="xs" icon="edit" aria-label="현재 집중점과 운영 상태 편집" onClick={() => onEdit("focus")}>{brand.currentFocus ? "수정" : "설정"}</Button></>} value={brand.currentFocus} placeholder="이번에 쌓거나 검증할 한 가지를 정해보세요." />
        </div>
        <div className="brand-detail-actions">
          <MemoCaptureLink context={{ type: "brand", id: brand.id }} />
          <Button variant="secondary" size="sm" icon="queue" onClick={() => onOpenQueue(brand.key)}>소재·원고 보기</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => onOpenStudio(brand.key)}>이 브랜드로 새 콘텐츠</Button>
        </div>
      </div>

      {brand.failedPublishes > 0 && (
        <div className="brand-publish-alert" role="status">
          <Iconed name="flag" size={13} />
          발행 실패 {brand.failedPublishes}건 · 발행 로그에서 원인을 확인하세요
        </div>
      )}

      <div className="brand-detail-grid">
        <Card pad={false} className="brand-identity-panel">
          <div className="brand-panel-heading">
            <div className="brand-panel-title">
              <h3>방향과 표현 기준</h3>
              <CertaintyBadge state={brand.identity.state} label={identityRowLabel(brand.identity)} />
            </div>
            <Button variant="secondary" size="sm" aria-label="브랜드 기준 전체 편집" onClick={() => onEdit("all")}>전체 편집</Button>
          </div>
          {IDENTITY_GROUPS.map((group) => <IdentityGroup key={group.key} group={group} brand={brand} onEdit={onEdit} />)}
        </Card>

        <Card style={{ padding: 16 }} className="brand-context-panel">
          <section className="brand-publishing-info" aria-label="발행 정보">
            <h3>발행 정보</h3>
            {(hasIdentityValue(brand.cadence) || brand.weeklyGoal.value != null) && <div className="brand-fact">
              <span className="brand-fact-label">발행 리듬</span>
              <p className="brand-fact-value">
                {brand.cadenceLabel}
                {brand.weeklyGoal.value != null && (
                  <span className="brand-fact-empty">
                    {" · 주 "}<span className="num">{brand.weeklyGoal.value}</span>건
                    {brand.weeklyGoal.certainty === "recommended" ? " (권장)" : ""}
                  </span>
                )}
              </p>
            </div>}
            {hasIdentityValue(brand.channels) && <ChipBlock label="채널" items={brand.channels} />}
            {hasIdentityValue(brand.sourceLinks) && <BrandSourceLinks items={brand.sourceLinks} />}
            {!hasPublishingInfo && <p className="brand-content-note">등록된 발행 리듬·채널·링크가 없습니다.</p>}
          </section>
          {brand.counts && <section aria-label="콘텐츠 현황">
            <h3>콘텐츠 현황</h3>
              <dl className="brand-content-counts">
                {[
                  ["아이디어", brand.counts.ideas],
                  ["초안·검토", brand.counts.drafts],
                  ["예약", brand.counts.scheduled],
                  ["발행", brand.counts.published],
                ].map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd className="stat">{value}</dd></div>
                ))}
              </dl>
          </section>}
          <RelatedMemos type="brand" id={brand.id} />
          <GoalLinks entityType="brands" entityId={brand.id} scope={brand.orgScope} />
        </Card>
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
  const [identitySection, setIdentitySection] = React.useState("all");
  const [directoryQuery, setDirectoryQuery] = React.useState("");
  const [directoryFilter, setDirectoryFilter] = React.useState("all");
  const searchRef = React.useRef(null);

  const directory = React.useMemo(
    () => buildBrandDirectory(ledger, { scope }),
    [ledger, scope],
  );
  const selected = selectBrand(directory, selectedKey);
  const syncState = syncStateOf(ledger.source, ledger.partial);
  const canBrowseDirectory = syncState === "live" || syncState === "partial";
  const visibleBrands = React.useMemo(
    () => filterBrandDirectory(directory.brands, { query: directoryQuery, filter: directoryFilter }),
    [directory.brands, directoryQuery, directoryFilter],
  );
  const hasDirectoryFilter = Boolean(directoryQuery.trim()) || directoryFilter !== "all";
  const clearDirectoryFilters = () => {
    setDirectoryQuery("");
    setDirectoryFilter("all");
    searchRef.current?.focus();
  };

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
        const message = data.status === "conflict" ? "다른 변경이 먼저 저장되었습니다. 입력을 보관하고 브랜드를 다시 열어주세요." : data.status === "preview" ? "저장 연결이 없어 입력을 유지했습니다. 브랜드 기준은 저장되지 않았습니다." : data.error || "브랜드 기준을 저장하지 못했습니다. 입력을 유지합니다.";
        setSaveNote({ tone: "err", label: message });
        // 이 편집기는 preview를 로컬 원장에 반영하지 않는다. 드로어 내부에서도
        // 실제 실패 원인을 보여주고, 재시도할 수 있도록 입력을 유지한다.
        return { ok: false, status: data.status === "conflict" ? "conflict" : "error", message };
      }
      if (data.brand?.updated_at) setIdentityDraft((current) => ({ ...current, expectedUpdatedAt: data.brand.updated_at }));
      const latest = await reload();
      const saved = latest?.brands?.find((brand) => brand.id === payload.id);
      const matches = saved && Object.entries(payload.identity).every(([key, value]) => JSON.stringify(saved[key]) === JSON.stringify(value))
        && saved.operatingState === payload.operatingState && saved.isFocused === payload.isFocused
        && Boolean(saved.identityConfirmedAt) === payload.confirmIdentity;
      if (!matches) {
        const message = "저장 응답을 받았지만 재조회 확인에 실패했습니다. 입력을 유지합니다.";
        setSaveNote({ tone: "err", label: message });
        return { ok: false, status: "error", message };
      }
      window.dispatchEvent(new Event("hub:brand-updated"));
      setSaveNote({ tone: "ok", label: "브랜드 기준 저장 · 재조회 확인됨" });
      return { ok: true, status: "saved" };
    } catch {
      const message = "브랜드 기준을 저장하지 못했습니다. 입력을 유지합니다.";
      setSaveNote({ tone: "err", label: message });
      return { ok: false, status: "error", message };
    }
  };

  const scopeSuffix = SCOPE_LABEL[scope] ? ` · ${SCOPE_LABEL[scope]}` : "";
  const totals = directory.totals;

  return (
    <div className="hub-page brands-page">
      <div className="brand-page-header">
        {selected && <Button variant="ghost" size="sm" icon="chevronL" onClick={() => setQuery(null)}>브랜드 목록</Button>}
        <div className="brand-page-title">
          <h2>{selected ? selected.name : "브랜드"}</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            {selected
              ? `${selected.isFocused ? "집중 브랜드 · " : ""}${BRAND_OPERATING_STATES.find((s) => s.value === selected.operatingState)?.label || "운영 상태 미정"}`
              : `${canBrowseDirectory ? `${directory.brands.length}개${scopeSuffix} · ` : ""}방향 · 집중점 · 자산`}
            <SyncBadge state={syncState} />
          </div>
        </div>
        {selected && directory.brands.length > 1 && (
          <SelectField
            label="브랜드 전환"
            fieldClassName="brand-switcher"
            value={selected.key}
            options={directory.brands.map((brand) => ({ value: brand.key, label: `${brand.name}${brand.isFocused ? " · 집중" : ""}` }))}
            onChange={(event) => { setSaveNote(null); setQuery(event.target.value); }}
          />
        )}
        {(saveNote || !selected) && <div className="brand-page-tools">
          {saveNote && (
            <span className="mono" style={{
              fontSize: 10.5, maxWidth: "100%", overflowWrap: "anywhere", lineHeight: 1.6,
              color: saveNote.tone === "ok" ? "var(--fg-muted)" : saveNote.tone === "err" ? "var(--danger)" : "var(--fg-dim)",
            }}>{saveNote.label}</span>
          )}
          {!selected && <>
            <Button variant="secondary" size="sm" onClick={openContentLog}>컨텐츠 로그</Button>
            <Button variant="primary" size="sm" icon="plus" onClick={createBrand}>브랜드 <Kbd>N</Kbd></Button>
          </>}
        </div>}
      </div>

      {/* "찾지 못함"은 라이브 기록을 실제로 읽었을 때만 말할 수 있다 — read 실패·미연결을
          부재로 위장하면 딥링크가 멀쩡한 브랜드를 없다고 단정한다 (2609 감사 #3). */}
      {selectedKey && !selected && (syncState === "live" || syncState === "partial") && (
        <Card>
          <EmptyState
            icon="brand"
            title={syncState === "partial" ? "불러온 목록에 이 브랜드가 없습니다" : "이 브랜드를 찾지 못했습니다"}
            description={syncState === "partial" ? `브랜드 목록을 일부만 읽어 '${selectedKey}'를 확인할 수 없습니다. 다시 읽어주세요.` : `'${selectedKey}'는 현재 스코프에 없거나 더 이상 존재하지 않습니다.`}
            action={<Button variant="secondary" size="sm" onClick={syncState === "partial" ? reload : () => setQuery(null)}>{syncState === "partial" ? "다시 읽기" : "브랜드 목록으로"}</Button>}
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
          onOpenStudio={openStudio}
          onOpenQueue={openQueue}
          onEdit={(section) => {
            setSaveNote(null);
            setIdentitySection(section);
            // 섹션은 보이는 필드만 좁힌다. 전체 draft와 원장 revision을 유지해야
            // 부분 편집을 저장해도 다른 섹션의 기준이 지워지지 않는다.
            setIdentityDraft(brandIdentityDraft(selected));
          }}
        />
      )}

      {!selectedKey && (
        <>
          {canBrowseDirectory && (directory.brands.length > 0 || hasDirectoryFilter) && (
            <div className="brand-directory-toolbar">
              <TextField
                ref={searchRef}
                type="search"
                label="브랜드 검색"
                placeholder="이름 · 약속 · 집중점 검색"
                value={directoryQuery}
                onChange={(event) => setDirectoryQuery(event.target.value)}
                fieldClassName="brand-directory-search"
              />
              <div className="brand-directory-filter">
                <span className="hub-label">빠른 보기</span>
                <ScrollShadowX>
                  <SegmentedControl label="브랜드 빠른 보기" options={BRAND_VIEW_FILTERS} value={directoryFilter} onChange={setDirectoryFilter} />
                </ScrollShadowX>
              </div>
            </div>
          )}
          {canBrowseDirectory && (
            <div className="brand-directory-summary">
              <span role="status" aria-live="polite">
                {hasDirectoryFilter ? <><span className="num">{visibleBrands.length}</span>개 표시 · </> : null}
                {syncState === "partial" ? "불러온 브랜드 " : "전체 "}<span className="num">{directory.brands.length}</span>개
              </span>
              {hasDirectoryFilter && <Button variant="ghost" size="sm" onClick={clearDirectoryFilters}>검색·필터 초기화</Button>}
              {totals?.failedPublishes > 0 && <span className="brand-directory-failures"><Iconed name="flag" size={13} />{syncState === "partial" ? "불러온 발행 실패" : "전체 발행 실패"} <span className="num">{totals.failedPublishes}</span>건</span>}
              {syncState === "partial" && <span className="brand-directory-partial">일부만 불러왔습니다.<Button variant="ghost" size="sm" onClick={reload}>다시 읽기</Button></span>}
            </div>
          )}

          <Card pad={false} className="hub-table-card">
            {canBrowseDirectory && visibleBrands.length > 0 && (
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
            {syncState === "live" && directory.brands.length === 0 && !hasDirectoryFilter && (
              <EmptyState
                icon="brand"
                title={scope === "all" ? "아직 브랜드가 없습니다" : `${SCOPE_LABEL[scope]} 스코프에 브랜드가 없습니다`}
                description="브랜드를 만들면 정체성·발행 리듬·기록이 한 곳에 모입니다."
                action={<Button variant={selected ? "secondary" : "primary"} size="sm" icon="plus" onClick={createBrand}>첫 브랜드 만들기</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {canBrowseDirectory && hasDirectoryFilter && visibleBrands.length === 0 && (
              <EmptyState
                icon="search"
                title="조건에 맞는 브랜드가 없습니다"
                description={syncState === "partial" ? "일부만 불러온 목록에서 검색했습니다. 검색·필터를 지우거나 다시 읽어주세요." : "다른 검색어를 입력하거나 빠른 보기를 전체로 바꿔보세요."}
                action={<Button variant="secondary" size="sm" onClick={clearDirectoryFilters}>검색·필터 초기화</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {syncState === "partial" && !hasDirectoryFilter && directory.brands.length === 0 && (
              <EmptyState
                icon="brand"
                title="브랜드 목록을 다시 확인해 주세요"
                description="일부 데이터만 읽어 현재 표시할 수 있는 브랜드가 없습니다."
                action={<Button variant="secondary" size="sm" onClick={reload}>다시 읽기</Button>}
                style={{ minHeight: 200 }}
              />
            )}
            {canBrowseDirectory && visibleBrands.map((brand) => (
              <BrandRow key={brand.key} brand={brand} onOpen={setQuery} />
            ))}
          </Card>
        </>
      )}

      {identityDraft && (
        <EditDrawer title={identitySection === "all" ? "브랜드 기준 편집" : identitySection === "focus" ? "집중점과 운영 상태" : `${IDENTITY_GROUPS.find(({ key }) => key === identitySection)?.label} 편집`}
          subtitle="빈칸은 나중에 채워도 됩니다. 확인 여부는 브랜드 기준 전체에 적용됩니다."
          width="min(560px, 96vw)" record={identityDraft}
          fields={identityEditorFields(identitySection)}
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
