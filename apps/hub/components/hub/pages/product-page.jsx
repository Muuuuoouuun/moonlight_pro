"use client";
// 제품 운영실 · 제품 페이지 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0 B안).
// 머리(운영 상태·단계, 숫자 3개) + 흐름(오늘 → 이번 주 → 다음 → 언젠가 → 지난): 일(프로젝트)·문의·깨진 신호가
// 한 줄로 섞인다. 옆에는 진행 중인 일, 요청 많은 신기능, 제품 카드·돈. 보드는 프로젝트 탭 Board를 제품으로 걸러 쓴다.
import React from "react";

import { Button, Drawer, Kbd, SectionTitle, SegmentedControl, SelectField, TextField } from "../hub-primitives";
import { useToast } from "../hub-toast";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import {
  FLOW_BUCKETS,
  OPS_REQUIRING_NOTE,
  PRODUCT_OPS,
  RECURRENCES,
  WORK_TYPES,
  flowFilter,
  monthNumbers,
  openInquiries,
  previousMonth,
  productFlow,
  productStageLabel,
  projectStateLabel,
  recurrenceLabel,
  seoulDay,
  workType,
} from "../../../lib/product-catalog.js";
import { INQUIRY_STATUSES } from "../inquiry-view-state";
import { createWork, linkInquiry, recordMonth, updateProduct } from "./product-client.js";
import { OpsLabel } from "./product-portfolio";
import styles from "./product-room.module.css";

const won = (value) => (value === null || value === undefined ? "—" : `${value < 0 ? "−" : ""}₩${Math.abs(value).toLocaleString("ko-KR")}`);
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

// ＋ 일 — 이 제품에 붙은 프로젝트를 만든다(신기능·보수·연락). 문의에서 만들 때는 제목·종류가 채워져 온다.
export function WorkDrawer({ product, areas, seed, onClose, onSaved }) {
  const [draft, setDraft] = React.useState(() => ({
    title: seed?.title || "",
    workType: seed?.workType || "feature",
    dueAt: "",
    recurrence: "",
    areaId: defaultArea(product, areas),
  }));
  const [state, setState] = React.useState({ saving: false, message: "" });
  const titleRef = React.useRef(null);
  const save = async (event) => {
    event?.preventDefault();
    if (!draft.title.trim()) { setState({ saving: false, message: "일 제목을 적어 주세요." }); return; }
    if (!draft.areaId) { setState({ saving: false, message: "업무 분야를 골라 주세요." }); return; }
    setState({ saving: true, message: "" });
    const id = newId();
    const outcome = await createWork({
      id,
      title: draft.title.trim(),
      areaId: draft.areaId,
      orgScope: product.orgScope,
      status: "active",
      priority: "medium",
      productId: product.id,
      workType: draft.workType,
      ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
      ...(draft.workType === "maintenance" && draft.recurrence ? { recurrence: draft.recurrence } : {}),
      source: "hub-products",
    });
    if (!outcome.ok) { setState({ saving: false, message: outcome.message }); return; }
    if (seed?.inquiryId) {
      const linked = await linkInquiry(seed.inquiryId, product.id, outcome.entity?.id || id);
      if (!linked.ok) { setState({ saving: false, message: `일은 만들었지만 문의를 붙이지 못했어요: ${linked.message}` }); onSaved(null); return; }
    }
    onSaved(`‘${draft.title.trim()}’ ${workType(draft.workType)?.label || "일"}을(를) 만들었어요.`);
  };
  return (
    <Drawer
      title={`${product.name} · 새 일`}
      subtitle={seed?.inquiryId ? "문의에서 만드는 일 — 만들면 문의가 이 일에 붙어요." : "프로젝트 탭의 프로젝트로 만들어지고 이 제품에 붙어요."}
      presentation="compact"
      onClose={state.saving ? undefined : onClose}
      initialFocusRef={titleRef}
      footer={<><span className={styles.spacer} />{state.message && <span role="alert" className={styles.danger} style={{ fontSize: 12 }}>{state.message}</span>}<Button variant="ghost" size="sm" onClick={onClose} disabled={state.saving}>닫기</Button><Button variant="primary" size="sm" onClick={save} disabled={state.saving}>{state.saving ? "만드는 중…" : "일 만들기"}</Button></>}
    >
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextField ref={titleRef} label="제목" required value={draft.title} maxLength={300} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: 채점 결과 엑셀 내보내기" />
        <SegmentedControl label="종류" options={WORK_TYPES.map((type) => ({ key: type.value, label: `${type.glyph} ${type.label}` }))} value={draft.workType} onChange={(value) => setDraft({ ...draft, workType: value })} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TextField label="기한" type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} fieldStyle={{ flex: "1 1 150px" }} />
          {draft.workType === "maintenance" && (
            <SelectField label="반복" value={draft.recurrence} onChange={(event) => setDraft({ ...draft, recurrence: event.target.value })}
              options={[{ value: "", label: "한 번" }, ...RECURRENCES]} fieldStyle={{ flex: "1 1 120px" }} />
          )}
        </div>
        <SelectField label="업무 분야" value={draft.areaId} onChange={(event) => setDraft({ ...draft, areaId: event.target.value })}
          options={areas.length ? areas.map((area) => ({ value: area.id, label: area.name })) : [{ value: "", label: "업무 분야가 없어요" }]} />
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
  const toNumber = (value) => {
    const digits = String(value).replace(/[^0-9]/g, "");
    return digits === "" ? null : Number(digits);
  };
  const save = async () => {
    setState({ saving: true, message: "" });
    const outcome = await recordMonth({
      productId: product.id,
      month: target,
      activeUsers: toNumber(draft.activeUsers),
      revenue: toNumber(draft.revenue),
      cost: toNumber(draft.cost),
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
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SegmentedControl label="달" options={[{ key: month, label: `이번 달 · ${monthLabel(month)}` }, { key: previousMonth(month), label: `지난달 · ${monthLabel(previousMonth(month))}` }]} value={target} onChange={setTarget} />
        <TextField label="주간 사용자 · 최근 7일 활성" inputMode="numeric" value={draft.activeUsers} onChange={(event) => setDraft({ ...draft, activeUsers: event.target.value })} placeholder={current.known ? "" : "모름"} />
        <TextField label="매출(원)" inputMode="numeric" value={draft.revenue} onChange={(event) => setDraft({ ...draft, revenue: event.target.value })} placeholder="모름" />
        <TextField label="비용(원) · 서버·도메인·API 등" inputMode="numeric" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} placeholder="모름" />
      </div>
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

function FlowRow({ item, onOpenProject, onOpenInquiry, onOpenSettings }) {
  if (item.kind === "signal") {
    return (
      <button type="button" className={`hub-row ${styles.flowRow} ${styles.rail}`} onClick={onOpenSettings} style={{ paddingLeft: 10 }}>
        <span className={styles.glyph} aria-hidden="true">✕</span>
        <span><span className={`${styles.rowTitle} ${styles.danger}`}>{item.title}</span><span className={styles.rowMeta}><span>GitHub</span><span>설정 › 개발에서 로그·Codex</span></span></span>
        <span className={`${styles.due} ${styles.danger}`}>지금</span>
      </button>
    );
  }
  if (item.kind === "inquiry") {
    const inquiry = item.inquiry;
    return (
      <button type="button" className={`hub-row ${styles.flowRow}`} onClick={() => onOpenInquiry(inquiry.id)}>
        <span className={styles.glyph} aria-hidden="true">?</span>
        <span>
          <span className={styles.rowTitle}>{inquiry.subject}</span>
          <span className={styles.rowMeta}>
            <span>문의</span><span>{INQUIRY_STATUSES[inquiry.status] || inquiry.status}</span>
            {inquiry.contactName && <span>{inquiry.contactName}</span>}
            <span>{inquiry.projectId ? "일에 붙음" : "일 연결 전"}</span>
          </span>
        </span>
        <span className={styles.due}>{shortDay(inquiry.receivedAt)}</span>
      </button>
    );
  }
  const project = item.project;
  const type = workType(project.workType);
  return (
    <button type="button" className={`hub-row ${styles.flowRow}${item.urgent ? ` ${styles.rail}` : ""}`} onClick={() => onOpenProject(project.id)} style={item.urgent ? { paddingLeft: 10 } : undefined}>
      <span className={styles.glyph} aria-hidden="true">{type?.glyph || "·"}</span>
      <span>
        <span className={`${styles.rowTitle}${project.status === "blocked" ? ` ${styles.danger}` : ""}`}>{project.name}</span>
        <span className={styles.rowMeta}>
          <span>{type?.label || "종류 미정"}</span>
          <span className={project.status === "blocked" ? styles.danger : undefined}>{projectStateLabel(project.status)}</span>
          {project.tasks > 0 && <span className="mono">할 일 {project.tasksDone}/{project.tasks}</span>}
          {project.recurrence && <span>↻ {recurrenceLabel(project.recurrence)}</span>}
          {project.requests > 0 && <span>요청 {project.requests}</span>}
        </span>
      </span>
      <span className={`${styles.due}${item.overdue ? ` ${styles.danger}` : ""}`}>{item.overdue ? `지남 ${shortDay(project.dueAt)}` : shortDay(project.dueAt)}</span>
    </button>
  );
}

export function ProductPage({ product, month, areas, onBack, onOpenProject, onOpenInquiry, onOpenBoard, onOpenSettings, onEditCard, onChanged }) {
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
  const open = openInquiries(product);
  const active = (product.projects || []).filter((project) => project.status !== "completed" && project.status !== "archived");
  const wanted = active.filter((project) => project.workType === "feature" && project.requests > 0).sort((a, b) => b.requests - a.requests);
  const details = product.details || {};
  const saved = (message) => {
    setDrawer(null);
    if (message) toast(message);
    onChanged();
  };

  return (
    <>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" onClick={onBack}>← 포트폴리오</Button>
      </div>
      <header className={styles.pageHead}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{[details.domain, details.audience].filter(Boolean).join(" · ") || "제품"}</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 500 }}>{product.name}</h2>
          <div className={styles.meta}>
            <Button variant="ghost" size="sm" onClick={() => setDrawer("ops")} aria-label={`운영 상태 바꾸기, 지금 ${PRODUCT_OPS.find((ops) => ops.value === product.opsStatus)?.label || "개발 중"}`}><OpsLabel value={product.opsStatus} /></Button>
            <span>{productStageLabel(product.stage)}</span>
            {product.opsNote && <span>· {product.opsNote}</span>}
            <Button variant="ghost" size="sm" onClick={onEditCard}>카드</Button>
            <Button variant="ghost" size="sm" onClick={onOpenSettings}>설정 · GitHub</Button>
          </div>
        </div>
        <div className={styles.numbers}>
          <div className={styles.number}><span className={`stat ${styles.numberValue}`}>{numbers.activeUsers ?? "—"}</span><span className={styles.dim}>주간 사용자</span></div>
          <div className={styles.number}><span className={`stat ${styles.numberValue}`}>{won(numbers.net)}</span><span className={styles.dim}>{monthLabel(month)} 순이익</span></div>
          <div className={styles.number}><span className={`stat ${styles.numberValue}`}>{open.length}</span><span className={styles.dim}>열린 문의</span></div>
          <Button variant="ghost" size="sm" onClick={() => setDrawer("month")}>숫자 적기</Button>
        </div>
      </header>

      <div className={styles.grid}>
        <div>
          <div className={styles.bar}>
            <SegmentedControl label="흐름 거르기" value={filter} onChange={setFilter} options={[
              { key: "all", label: `전체 ${liveCount("all")}` },
              { key: "feature", label: `신기능 ${liveCount("feature")}` },
              { key: "maintenance", label: `보수 ${liveCount("maintenance")}` },
              { key: "contact", label: `연락 ${liveCount("contact")}` },
              { key: "inquiry", label: `문의 ${liveCount("inquiry")}` },
            ]} />
            <span className={styles.spacer} />
            <Button variant="outline" size="sm" onClick={onOpenBoard}>보드로 보기</Button>
            <Button variant="primary" size="sm" icon="plus" onClick={() => setDrawer("work")}>일 <Kbd>N</Kbd></Button>
          </div>
          {FLOW_BUCKETS.map((bucket) => {
            const items = flow.find((entry) => entry.key === bucket.key).items.filter((item) => flowFilter(item, filter));
            if (!items.length) return null;
            if (bucket.key === "past" && !showPast) {
              return <Button key="past" variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => setShowPast(true)}>지난 {items.length}건 보기</Button>;
            }
            return (
              <section key={bucket.key} className={styles.bucket} aria-label={bucket.label}>
                <div className={styles.bucketHead}>{bucket.label} <span className="mono">{items.length}</span></div>
                {items.map((item) => (
                  <FlowRow key={item.key} item={item} onOpenProject={onOpenProject} onOpenInquiry={onOpenInquiry} onOpenSettings={onOpenSettings} />
                ))}
              </section>
            );
          })}
          {!all.some((item) => item.bucket !== "past" && flowFilter(item, filter)) && (
            <p className={styles.dim} style={{ marginTop: 16 }}>
              {filter === "all" ? "아직 이 제품에 붙은 일·문의가 없어요. ＋ 일로 신기능·보수·연락을 만들어 보세요." : "이 종류의 열린 일이 없어요."}
            </p>
          )}
        </div>

        <aside className={styles.aside}>
          <div className={styles.panel}>
            <SectionTitle right={<span className="mono" style={{ fontSize: 12 }}>{active.length}</span>}>진행 중인 일</SectionTitle>
            {active.length ? active.map((project) => (
              <div key={project.id} className={styles.mini}>
                <span className={styles.name} style={{ fontWeight: 400 }}>{workType(project.workType)?.glyph || "·"} {project.name}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{project.tasks ? `${project.tasksDone}/${project.tasks}` : "—"}</span>
              </div>
            )) : <p className={styles.dim}>없음</p>}
          </div>
          {wanted.length > 0 && (
            <div className={styles.panel}>
              <SectionTitle subtitle="문의가 붙은 수">요청 많은 신기능</SectionTitle>
              {wanted.map((project) => (
                <div key={project.id} className={styles.mini}><span>{project.name}</span><span className="mono">{project.requests}</span></div>
              ))}
            </div>
          )}
          <div className={styles.panel}>
            <details>
              <summary className={styles.muted} style={{ cursor: "pointer" }}>제품 카드 · 돈</summary>
              <div className={styles.kv} style={{ marginTop: 10 }}>
                <span>한 줄</span><span>{product.summary}</span>
                <span>대상 고객</span><span>{details.audience || "—"}</span>
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
