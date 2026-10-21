"use client";
// 제품 상세 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0 B안의 제품 페이지 → 2026-10-21 12d 흐름).
// 머리 · 연결 링크 · 계기 4칸 + 흐름(오늘 → 이번 주 → 다음 → 언젠가 → 지난): 일(프로젝트)·문의·깨진 신호가
// 한 줄로 섞인다. 옆에는 진행 중인 일, 요청 많은 신기능, 단계 이력, 제품 카드·돈. 보드는 프로젝트 탭 Board를 제품으로 걸러 쓴다.
import React from "react";

import { Button, Drawer, Kbd, SegmentedControl, SelectField, TextField } from "../hub-primitives";
import { useToast } from "../hub-toast";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import {
  FLOW_BUCKETS,
  OPS_REQUIRING_NOTE,
  PRODUCT_OPS,
  RECURRENCES,
  WORK_TYPES,
  flowFilter,
  formatPricing,
  monthNumbers,
  openInquiries,
  parseMonthInput,
  previousMonth,
  productFlow,
  productMode,
  productStageLabel,
  projectStateLabel,
  recurrenceLabel,
  saveWork,
  seoulDay,
  workDrawerSubtitle,
  workCreateBody,
  workType,
} from "../../../lib/product-catalog.js";
import { changeLabel, monthlyLabel, percentChange, productHealth, productLinks, productSeries, stageTimeline, statusDots } from "../../../lib/product-instruments.js";
import { INQUIRY_STATUSES } from "../inquiry-view-state";
import { createWork, linkInquiry, recordMonth, updateProduct } from "./product-client.js";
import { ModeLabel, ProductMark } from "./product-mark";
import { Axis, DotRows, Kpi, ProfitColumns, TrendLine } from "./product-portfolio";
import styles from "./product-room.module.css";
import { formatSignedWonShort, formatWon, formatWonShort } from "@/lib/won-format";

const won = (value) => formatWon(value);
const monthLabel = (month) => `${Number(String(month).slice(5, 7))}월`;
const shortDay = (value) => (value ? seoulDay(value)?.slice(5) : "");

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 이 제품의 일에서 가장 많이 쓴 업무 분야 — 새 일의 기본값.
function defaultArea(product, areas) {
  const counts = new Map();
  for (const project of product.projects || []) if (project.areaId) counts.set(project.areaId, (counts.get(project.areaId) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top || areas[0]?.id || "";
}

// ＋ 일 — 이 제품에 붙은 프로젝트를 만든다(신기능·보수·연락). 문의에서 만들 때는 제목·종류가 채워져 오고,
// 문의에 고객(리드)이 붙어 있으면 seed.customer로 와서 그 고객이 일에 붙는다(workCreateBody → entityRef).
// 고객을 붙이지 못하면(리드 삭제 등) 저장 실패로 알린다 — 고객을 빼고 몰래 다시 만들지 않는다.
// 일은 만들었는데 문의 붙이기가 실패하면 드로어를 연 채로 두고, 다시 누르면 그 일에 문의만 붙인다(saveWork createdId).
// 그대로 닫으면 부모가 새로 읽고 danger 토스트로 남긴다 — 조용히 닫혀 성공처럼 보이지 않게.
export function WorkDrawer({ product, areas, seed, onClose, onSaved }) {
  const [draft, setDraft] = React.useState(() => ({
    title: seed?.title || "",
    workType: seed?.workType || "feature",
    dueAt: "",
    recurrence: "",
    areaId: defaultArea(product, areas),
  }));
  const [state, setState] = React.useState({ saving: false, message: "", unknownOutcome: false });
  const [created, setCreated] = React.useState(null); // 만들었지만 문의가 아직 안 붙은 일의 id
  const titleRef = React.useRef(null);
  const savingRef = React.useRef(false);
  const attemptRef = React.useRef(null);
  const changeDraft = (patch) => {
    if (savingRef.current || attemptRef.current) return;
    setDraft((current) => ({ ...current, ...patch }));
  };
  const save = async (event) => {
    event?.preventDefault();
    if (savingRef.current) return;
    if (!attemptRef.current && !draft.title.trim()) { setState({ saving: false, message: "일 제목을 적어 주세요." }); return; }
    if (!attemptRef.current && !draft.areaId) { setState({ saving: false, message: "업무 분야를 골라 주세요." }); return; }
    // 결과가 유실돼도 ID·입력·문의 연결은 처음 보낸 명령 그대로다. 확정 거절 전에는
    // 입력도 잠근다 — 같은 ID에 나중 제목을 실으면 충돌하고, 새 ID면 일이 중복된다.
    const attempt = attemptRef.current ||= {
      body: workCreateBody(product, draft, seed, newId()),
      inquiryId: seed?.inquiryId || null,
      createdId: null,
      unknownOutcome: false,
    };
    savingRef.current = true;
    setState({ saving: true, message: "", unknownOutcome: attempt.unknownOutcome });
    try {
      const result = await saveWork({ createWork, linkInquiry }, attempt);
      attempt.createdId = result.createdId;
      if (!result.ok) {
        // 뒤의 401·preview는 앞선 미확정 명령이 저장되지 않았다는 증거가 아니다.
        if (result.unknownOutcome) attempt.unknownOutcome = true;
        if (!attempt.createdId && !attempt.unknownOutcome) attemptRef.current = null;
        setCreated(result.createdId);
        setState({ saving: false, message: result.message, unknownOutcome: attempt.unknownOutcome });
        return;
      }
      onSaved(`‘${attempt.body.title}’ ${workType(attempt.body.workType)?.label || "일"}을(를) 만들었어요.`);
    } finally {
      savingRef.current = false;
    }
  };
  const close = () => {
    if (savingRef.current) return;
    if (created) onSaved(`‘${attemptRef.current.body.title}’ 일은 만들었지만 문의는 붙지 않았어요. 문의의 ‘붙은 일’에서 골라 주세요.`, { tone: "danger" });
    else onClose();
  };
  return (
    <Drawer
      title={`${product.name} · 새 일`}
      subtitle={workDrawerSubtitle(seed)}
      presentation="compact"
      onClose={state.saving ? undefined : close}
      initialFocusRef={titleRef}
      footer={<><span className={styles.spacer} />{state.message && <span role="alert" className={styles.danger} style={{ fontSize: 12 }}>{state.message}</span>}<Button variant="ghost" size="sm" onClick={close} disabled={state.saving}>닫기</Button><Button variant="primary" size="sm" onClick={save} disabled={state.saving}>{state.saving ? (created ? "붙이는 중…" : state.unknownOutcome ? "확인 중…" : "만드는 중…") : created ? "문의 다시 붙이기" : state.unknownOutcome ? "저장 결과 확인" : "일 만들기"}</Button></>}
    >
      <form onSubmit={save}>
        {/* 저장 중·결과 미확정·문의 연결 대기에는 처음 보낸 입력을 유지한다. */}
        <fieldset disabled={state.saving || state.unknownOutcome || Boolean(created)} style={{ display: "flex", flexDirection: "column", gap: 12, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <TextField ref={titleRef} label="제목" required value={draft.title} maxLength={300} onChange={(event) => changeDraft({ title: event.target.value })} placeholder="예: 채점 결과 엑셀 내보내기" />
          <SegmentedControl label="종류" options={WORK_TYPES.map((type) => ({ key: type.value, label: `${type.glyph} ${type.label}` }))} value={draft.workType} onChange={(value) => changeDraft({ workType: value })} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <TextField label="기한" type="date" value={draft.dueAt} onChange={(event) => changeDraft({ dueAt: event.target.value })} fieldStyle={{ flex: "1 1 150px" }} />
            {draft.workType === "maintenance" && (
              <SelectField label="반복" value={draft.recurrence} onChange={(event) => changeDraft({ recurrence: event.target.value })}
                options={[{ value: "", label: "한 번" }, ...RECURRENCES]} fieldStyle={{ flex: "1 1 120px" }} />
            )}
          </div>
          <SelectField label="업무 분야" value={draft.areaId} onChange={(event) => changeDraft({ areaId: event.target.value })}
            options={areas.length ? areas.map((area) => ({ value: area.id, label: area.name })) : [{ value: "", label: "업무 분야가 없어요" }]} />
        </fieldset>
      </form>
    </Drawer>
  );
}

// 월 숫자 — 주간 사용자(최근 7일 활성)·매출·비용. 비운 칸은 "모름"으로 저장된다.
function MonthDrawer({ product, month, onClose, onSaved }) {
  const [target, setTarget] = React.useState(month);
  const current = monthNumbers(product, target);
  const [draft, setDraft] = React.useState(null);
  React.useEffect(() => {
    const numbers = monthNumbers(product, target);
    setDraft({
      activeUsers: numbers.activeUsers ?? "",
      revenue: numbers.revenue ?? "",
      cost: numbers.cost ?? "",
    });
  }, [product, target]);
  const [state, setState] = React.useState({ saving: false, message: "" });
  if (!draft) return null;
  const save = async () => {
    if (state.saving) return;
    const parsed = parseMonthInput(draft);
    if (!parsed.ok) { setState({ saving: false, message: parsed.message }); return; }
    setState({ saving: true, message: "" });
    const outcome = await recordMonth({
      productId: product.id,
      month: target,
      ...parsed.values,
    });
    if (!outcome.ok) { setState({ saving: false, message: outcome.message }); return; }
    onSaved(`${monthLabel(target)} 숫자를 적었어요.`);
  };
  return (
    <Drawer
      title={`${product.name} · 월 숫자`}
      subtitle="연결 전까지는 직접 적어요. 모르면 비워 두세요 — 0이 아니라 모름으로 남아요."
      presentation="compact"
      onClose={state.saving ? undefined : onClose}
      footer={<><span className={styles.spacer} />{state.message && <span role="alert" className={styles.danger} style={{ fontSize: 12 }}>{state.message}</span>}<Button variant="ghost" size="sm" onClick={onClose} disabled={state.saving}>닫기</Button><Button variant="primary" size="sm" onClick={save} disabled={state.saving}>{state.saving ? "저장 중…" : "저장"}</Button></>}
    >
      <fieldset disabled={state.saving} style={{ display: "flex", flexDirection: "column", gap: 12, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <SegmentedControl label="달" options={[{ key: month, label: `이번 달 · ${monthLabel(month)}` }, { key: previousMonth(month), label: `지난달 · ${monthLabel(previousMonth(month))}` }]} value={target} onChange={setTarget} />
        <TextField label="주간 사용자 · 최근 7일 활성" inputMode="numeric" value={draft.activeUsers} onChange={(event) => setDraft({ ...draft, activeUsers: event.target.value })} placeholder={current.known ? "" : "모름"} />
        <TextField label="매출(원)" inputMode="numeric" value={draft.revenue} onChange={(event) => setDraft({ ...draft, revenue: event.target.value })} placeholder="모름" />
        <TextField label="비용(원) · 서버·도메인·API 등" inputMode="numeric" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} placeholder="모름" />
      </fieldset>
    </Drawer>
  );
}

// 운영 상태 — 개발 중 · 사용 중 · 일시 중지 · 종료. 중지·종료는 이유 한 줄.
function OpsDrawer({ product, onClose, onSaved }) {
  const [target, setTarget] = React.useState(product.opsStatus || "dev");
  const [note, setNote] = React.useState(product.opsNote || "");
  const [state, setState] = React.useState({ saving: false, message: "" });
  const needsNote = OPS_REQUIRING_NOTE.has(target);
  const save = async () => {
    if (needsNote && !note.trim()) { setState({ saving: false, message: "이유를 한 줄 남겨 주세요." }); return; }
    setState({ saving: true, message: "" });
    const outcome = await updateProduct({ id: product.id, expectedUpdatedAt: product.updatedAt, opsStatus: target, ...(note.trim() ? { opsNote: note.trim() } : {}) });
    if (!outcome.ok) { setState({ saving: false, message: outcome.message }); return; }
    onSaved(`상태를 ‘${PRODUCT_OPS.find((ops) => ops.value === target)?.label}’로 바꿨어요.`);
  };
  return (
    <Drawer
      title={`${product.name} · 운영 상태`}
      subtitle="단계(얼마나 자랐나)와 별개로, 지금 어떤지만 적어요."
      presentation="compact"
      onClose={state.saving ? undefined : onClose}
      footer={<><span className={styles.spacer} />{state.message && <span role="alert" className={styles.danger} style={{ fontSize: 12 }}>{state.message}</span>}<Button variant="ghost" size="sm" onClick={onClose} disabled={state.saving}>닫기</Button><Button variant="primary" size="sm" onClick={save} disabled={state.saving || (target === product.opsStatus && note === (product.opsNote || ""))}>{state.saving ? "저장 중…" : "저장"}</Button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SegmentedControl label="운영 상태" options={PRODUCT_OPS.map((ops) => ({ key: ops.value, label: `${ops.glyph} ${ops.label}` }))} value={target} onChange={setTarget} />
        <TextField label={needsNote ? "이유 한 줄 · 다시 볼 날" : "메모 (선택)"} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder={needsNote ? "예: API 비용 대비 사용 적음 · 11/15 다시 봄" : ""} />
      </div>
    </Drawer>
  );
}

// 종류 칩 — 색이 아니라 기호 + 글자(◆ 신기능 · ↻ 보수 · ↗ 연락 · ? 문의, 문의는 점선).
function KindChip({ item }) {
  if (item.kind === "signal") return <span className={`${styles.kind} ${styles.danger}`}><i aria-hidden="true">✕</i>CI</span>;
  if (item.kind === "inquiry") return <span className={styles.kind} data-inquiry=""><i aria-hidden="true">?</i>문의</span>;
  const type = workType(item.project.workType);
  return <span className={styles.kind}><i aria-hidden="true">{type?.glyph || "·"}</i>{type?.label || "종류 미정"}</span>;
}

// 할 일 진척 — 칸 수로(퍼센트 원형 없음). 칸이 많으면 숫자만.
function TaskCells({ done, total }) {
  if (!total) return null;
  return (
    <span className={styles.taskCells} role="img" aria-label={`할 일 ${done}/${total}`}>
      {total <= 8 && Array.from({ length: total }, (_, index) => <i key={index} data-on={index < done ? "" : undefined} />)}
      <span className="mono">{done}/{total}</span>
    </span>
  );
}

function FlowRow({ item, onOpenProject, onOpenInquiry, onOpenSettings }) {
  if (item.kind === "signal") {
    return (
      <button type="button" className={`hub-row ${styles.flowRow} ${styles.rail}`} onClick={() => onOpenSettings("dev")}>
        <KindChip item={item} />
        <span><span className={`${styles.rowTitle} ${styles.danger}`}>{item.title}</span><span className={styles.rowMeta}><span>GitHub</span><span>개발 탭에서 로그·Codex</span></span></span>
        <span />
        <span className={`${styles.due} ${styles.danger}`}>지금</span>
      </button>
    );
  }
  if (item.kind === "inquiry") {
    const inquiry = item.inquiry;
    return (
      <button type="button" className={`hub-row ${styles.flowRow}`} onClick={() => onOpenInquiry(inquiry.id)}>
        <KindChip item={item} />
        <span>
          <span className={styles.rowTitle}>{inquiry.subject}</span>
          <span className={styles.rowMeta}>
            <span>{INQUIRY_STATUSES[inquiry.status] || inquiry.status}</span>
            {inquiry.contactName && <span>{inquiry.contactName}</span>}
            <span>{inquiry.projectId ? "일에 붙음" : "일 연결 전"}</span>
          </span>
        </span>
        <span />
        <span className={styles.due}>{shortDay(inquiry.receivedAt)}</span>
      </button>
    );
  }
  const project = item.project;
  return (
    <button type="button" className={`hub-row ${styles.flowRow}${item.urgent ? ` ${styles.rail}` : ""}`} onClick={() => onOpenProject(project.id)}>
      <KindChip item={item} />
      <span>
        <span className={`${styles.rowTitle}${project.status === "blocked" ? ` ${styles.danger}` : ""}`}>{project.name}</span>
        <span className={styles.rowMeta}>
          <span className={project.status === "blocked" ? styles.danger : undefined}>{projectStateLabel(project.status)}</span>
          {project.recurrence && <span>↻ {recurrenceLabel(project.recurrence)}</span>}
          {project.requests > 0 && <span>요청 {project.requests}</span>}
        </span>
      </span>
      <TaskCells done={project.tasksDone} total={project.tasks} />
      <span className={`${styles.due}${item.overdue ? ` ${styles.danger}` : ""}`}>{item.overdue ? `지남 ${shortDay(project.dueAt)}` : shortDay(project.dueAt) || "—"}</span>
    </button>
  );
}

// 제품 상세 = 12d 흐름 (2026-10-21 운영자 "D 첫 화면 + 12a-1 보기 + 상세 12d", 운영실 B안 §0의 제품 페이지를 계기 어휘로).
// 머리(마크 · 이름 · 모드 · 단계 · 버전) → 연결 링크 → 계기 4칸(사용자 · 손익 · 문의 · 운영 건강) → 흐름(오늘 → 이번 주 → 다음 →
// 언젠가, 일과 문의가 섞임, 거르기) + 레일(진행 중 프로젝트 · 요청 많은 신기능 · 단계 이력 · 제품 카드·돈).
// 새 데이터는 없다 — 원장의 월 숫자·문의·저장소·stage_history만 읽고, 가동 체크·에러 수집은 "○ 연결 전"으로 둔다.
// 개발(저장소·GitHub·Codex)은 운영 건강 칸의 "개발 · GitHub"에서 기존 상세 드로어의 개발 탭으로 연다.
export function ProductPage({ product, month, months, areas, backLabel = "제품", onBack, onOpenProject, onOpenInquiry, onOpenBoard, onOpenSettings, onEditCard, onChanged }) {
  const toast = useToast();
  const [filter, setFilter] = React.useState("all");
  const [showPast, setShowPast] = React.useState(false);
  const [drawer, setDrawer] = React.useState(null); // work | month | ops
  React.useEffect(() => { setFilter("all"); setShowPast(false); }, [product.id]);
  usePageCreateHotkey(() => setDrawer("work"), { enabled: !drawer });

  const flow = productFlow(product);
  const all = flow.flatMap((bucket) => bucket.items);
  const liveCount = (key) => all.filter((item) => item.bucket !== "past" && flowFilter(item, key)).length;
  const numbers = monthNumbers(product, month);
  const series = productSeries(product, months);
  const users = series.map((row) => row.activeUsers);
  const nets = series.map((row) => row.net);
  const open = openInquiries(product);
  const linked = open.filter((inquiry) => inquiry.projectId).length;
  const active = (product.projects || []).filter((project) => project.status !== "completed" && project.status !== "archived");
  const wanted = active.filter((project) => project.workType === "feature" && project.requests > 0).sort((a, b) => b.requests - a.requests);
  const health = productHealth(product);
  const timeline = stageTimeline(product);
  const details = product.details || {};
  const mode = productMode(product);
  const netPrev = nets[nets.length - 2];
  const facts = [product.summary, details.domain, details.audience].filter(Boolean).join(" · ");
  const saved = (message, options) => {
    setDrawer(null);
    if (message) toast(message, options);
    onChanged();
  };

  return (
    <>
      <header className={styles.hero}>
        <div style={{ minWidth: 0 }}>
          <Button variant="ghost" size="sm" onClick={onBack}>← {backLabel}</Button>
          <div className={styles.idRow}>
            <ProductMark product={product} size="lg" />
            <div style={{ minWidth: 0 }}>
              <h2 className={styles.detailTitle}>{product.name}</h2>
              <div className={styles.meta}>
                <Button variant="ghost" size="sm" onClick={() => setDrawer("ops")} aria-label={`운영 상태 바꾸기, 지금 ${mode.label}`}><ModeLabel product={product} /></Button>
                <span>{productStageLabel(product.stage)} 단계</span>
                <span className="mono">v{product.version}</span>
                <Button variant="ghost" size="sm" onClick={onEditCard}>카드</Button>
                <Button variant="ghost" size="sm" onClick={() => onOpenSettings("overview")}>단계 · 체크리스트</Button>
              </div>
              {(facts || product.opsNote) && <p className={styles.facts}>{[facts, product.opsNote].filter(Boolean).join(" · ")}</p>}
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Button variant="outline" size="sm" onClick={onOpenBoard}>보드로 보기</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setDrawer("work")}>일 <Kbd>N</Kbd></Button>
        </div>
      </header>

      <div className={styles.bar} aria-label="연결 링크">
        {productLinks(product).map((link) => (link.on ? (
          <a key={link.key} className={styles.linkChip} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <span className="mono">{link.value}</span></a>
        ) : (
          <span key={link.key} className={styles.linkChip} data-off="">{link.label} · {link.value}</span>
        )))}
      </div>

      <div className={`${styles.kpis} ${styles.kpis4}`}>
        <Kpi label="주간 사용자" note={changeLabel(percentChange(users, 1), "지난달")} value={numbers.activeUsers ?? "—"} foot="최근 7일 활성 · 달마다 입력">
          <TrendLine values={users} pulse={Number.isFinite(numbers.revenue) && numbers.revenue > 0} width={230} height={60} label={monthlyLabel("주간 사용자", months, users, String)} />
          <Axis months={months} />
        </Kpi>
        <Kpi label={`${monthLabel(month)} 순이익`} note={numbers.net !== null && Number.isFinite(netPrev) ? `${formatSignedWonShort(numbers.net - netPrev)} · 지난달` : null}
          value={formatWonShort(numbers.net)}
          foot={<><span>매출 {formatWonShort(numbers.revenue)} · 비용 {formatWonShort(numbers.cost)} (빗금)</span><Button variant="ghost" size="sm" onClick={() => setDrawer("month")}>숫자 적기</Button></>}>
          <ProfitColumns series={series} label={monthlyLabel("6개월 순이익", months, nets, formatWonShort)} />
          <Axis months={months} />
        </Kpi>
        <Kpi label="열린 문의" note={linked ? `일에 붙은 문의 ${linked}` : null} value={open.length}
          foot={wanted.length ? `문의가 쌓인 신기능 ${wanted.length}개 → 아래 레일` : null}>
          <DotRows rows={statusDots(product.inquiries)} label={`열린 문의 ${open.length}: ${statusDots(product.inquiries).map((row) => `${row.label} ${row.dots.length}`).join(", ")}`} />
        </Kpi>
        <Kpi label="운영 건강" note={`원천 ${health.connected}/${health.total}`}
          foot={<Button variant="ghost" size="sm" onClick={() => onOpenSettings("dev")}>개발 · GitHub →</Button>}>
          <div className={styles.health}>
            {health.lines.map((line) => (
              <div key={line.key} className={`${styles.healthLine}${line.urgent ? ` ${styles.rail}` : ""}`}>
                <span className={`mono ${line.urgent ? styles.danger : line.known ? "" : styles.dim}`} aria-hidden="true">{line.glyph}</span>
                <span className={line.urgent ? styles.danger : line.known ? undefined : styles.dim}>{line.label}</span>
                <span className={`mono ${styles.dim}`}>{line.value || ""}</span>
              </div>
            ))}
          </div>
        </Kpi>
      </div>

      <div className={styles.grid}>
        <section className={styles.sheet} aria-label="흐름">
          <div className={styles.sheetHead}>
            <h3 className={styles.sheetTitle}>흐름 <span className={styles.dim}>· 일과 문의가 한 줄로</span></h3>
            <SegmentedControl label="흐름 거르기" value={filter} onChange={setFilter} options={[
              { key: "all", label: `전체 ${liveCount("all")}` },
              { key: "feature", label: `신기능 ${liveCount("feature")}` },
              { key: "maintenance", label: `보수 ${liveCount("maintenance")}` },
              { key: "contact", label: `연락 ${liveCount("contact")}` },
              { key: "inquiry", label: `문의 ${liveCount("inquiry")}` },
            ]} />
          </div>
          {FLOW_BUCKETS.map((bucket) => {
            const items = flow.find((entry) => entry.key === bucket.key).items.filter((item) => flowFilter(item, filter));
            if (!items.length) return null;
            if (bucket.key === "past" && !showPast) {
              return <Button key="past" variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowPast(true)}>지난 {items.length}건 보기 · 끝낸 일 · 닫은 문의</Button>;
            }
            return (
              <section key={bucket.key} className={styles.bucket} aria-label={bucket.label}>
                <div className={styles.bucketHead}><span className={styles.eyebrow}>{bucket.label}</span><span className="mono">{items.length}</span></div>
                {items.map((item) => (
                  <FlowRow key={item.key} item={item} onOpenProject={onOpenProject} onOpenInquiry={onOpenInquiry} onOpenSettings={onOpenSettings} />
                ))}
              </section>
            );
          })}
          {!all.some((item) => item.bucket !== "past" && flowFilter(item, filter)) && (
            <p className={styles.dim} style={{ margin: 0 }}>
              {filter === "all" ? "아직 이 제품에 붙은 일·문의가 없어요. ＋ 일로 신기능·보수·연락을 만들어 보세요." : "이 종류의 열린 일이 없어요."}
            </p>
          )}
        </section>

        <aside className={styles.aside}>
          <div className={styles.panel}>
            <div className={styles.sheetHead}><span className={styles.eyebrow}>진행 중인 프로젝트</span><span className="mono">{active.length}</span></div>
            {active.length ? active.map((project) => (
              <button key={project.id} type="button" className={`hub-row ${styles.miniRow}`} onClick={() => onOpenProject(project.id)}>
                <span style={{ minWidth: 0 }}>
                  <span className={styles.name}>{project.name}</span>
                  <span className={styles.rowMeta}>
                    <span>{workType(project.workType)?.label || "종류 미정"}</span>
                    {project.requests > 0 && <span>요청 {project.requests}</span>}
                    {project.dueAt && <span className="mono">목표 {shortDay(project.dueAt)}</span>}
                  </span>
                </span>
                <TaskCells done={project.tasksDone} total={project.tasks} />
              </button>
            )) : <p className={styles.dim} style={{ margin: 0 }}>없음</p>}
          </div>
          {wanted.length > 0 && (
            <div className={styles.panel}>
              <div className={styles.sheetHead}><span className={styles.eyebrow}>요청 많은 신기능</span><span className={styles.dim}>문의가 붙은 수</span></div>
              {wanted.map((project) => (
                <div key={project.id} className={styles.reqBar}>
                  <span>{project.name} <span className={styles.dim}>· {projectStateLabel(project.status)}</span></span>
                  <span className="mono">{project.requests}</span>
                  <span className={styles.reqTrack} aria-hidden="true"><i style={{ width: `${Math.round((project.requests / wanted[0].requests) * 100)}%` }} /></span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.panel}>
            <div className={styles.sheetHead}>
              <span className={styles.eyebrow}>단계 이력</span>
              {timeline.currentDays !== null && <span className={styles.dim}>{productStageLabel(product.stage)} {timeline.currentDays}일째</span>}
            </div>
            {timeline.entries.length ? timeline.entries.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className={styles.stageLine} data-launch={entry.launch ? "" : undefined}>
                <span className="mono" aria-hidden="true">{entry.launch ? "◉" : index === 0 ? "●" : "·"}</span>
                <span style={{ minWidth: 0 }}>
                  <span>{entry.text}{entry.launch ? " · 운영 시작" : ""}</span>
                  {entry.reason && <span className={styles.rowMeta}>{entry.reason}</span>}
                </span>
                <span className={`mono ${styles.dim}`}>{shortDay(entry.at)}</span>
              </div>
            )) : <p className={styles.dim} style={{ margin: 0 }}>기록 없음</p>}
          </div>
          <div className={styles.panel}>
            <details>
              <summary className={styles.muted} style={{ cursor: "pointer" }}>제품 카드 · 돈</summary>
              <div className={styles.kv} style={{ marginTop: 10 }}>
                <span>한 줄</span><span>{product.summary}</span>
                <span>대상 고객</span><span>{details.audience || "—"}</span>
                <span>가격</span><span>{formatPricing(details.pricing)}</span>
                <span>{monthLabel(month)} 매출</span><span className="mono">{won(numbers.revenue)}</span>
                <span>{monthLabel(month)} 비용</span><span className="mono">{won(numbers.cost)}</span>
                <span>특이사항</span><span style={{ whiteSpace: "pre-wrap" }}>{details.notes || "—"}</span>
              </div>
            </details>
          </div>
        </aside>
      </div>

      {drawer === "work" && <WorkDrawer product={product} areas={areas} onClose={() => setDrawer(null)} onSaved={saved} />}
      {drawer === "month" && <MonthDrawer product={product} month={month} onClose={() => setDrawer(null)} onSaved={saved} />}
      {drawer === "ops" && <OpsDrawer product={product} onClose={() => setDrawer(null)} onSaved={saved} />}
    </>
  );
}
