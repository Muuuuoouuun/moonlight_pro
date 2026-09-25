"use client";
// 제품 운영실 · 문의함 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0 B안).
// 모든 제품의 문의를 목록·상세 2단으로(폰은 목록 → 상세). 읽고 → 제품·일을 고르고 → 상태를 바꾼다.
// 같은 요청은 같은 일에 붙어 "요청 N건"으로 쌓인다. 답장·분리 같은 문의 자체의 편집은 기존 문의 화면(영업·매출 › 문의)이 정본이다.
import React from "react";

import { Button, EmptyState, SegmentedControl, SelectField, Skeleton, TruthBadge } from "../hub-primitives";
import { useToast } from "../hub-toast";
import { INQUIRY_SOURCES, INQUIRY_STATUSES, inquiryTime, writeInquiry } from "../inquiry-view-state";
import { projectStateLabel, seoulDay, workType } from "../../../lib/product-catalog.js";
import { linkInquiry } from "./product-client.js";
import { WorkDrawer } from "./product-page";
import styles from "./product-room.module.css";

const FILTERS = [
  { key: "open", label: "열린 것", test: (q) => q.status !== "closed" },
  { key: "new", label: "새", test: (q) => q.status === "new" },
  { key: "waiting", label: "답변 대기", test: (q) => q.status === "waiting" },
  { key: "unassigned", label: "제품 미정", test: (q) => !q.productId && q.status !== "closed" },
  { key: "all", label: "전체", test: () => true },
];
const STATUS_OPTIONS = ["new", "in_progress", "waiting", "closed"].map((value) => ({ value, label: INQUIRY_STATUSES[value] }));

function InquiryDetail({ inquiry, products, areas, onBack, onChanged }) {
  const toast = useToast();
  const [detail, setDetail] = React.useState({ status: "loading" });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [creating, setCreating] = React.useState(null); // { workType }
  const [reload, setReload] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const controller = new AbortController();
    setDetail({ status: "loading" });
    fetch(`/api/hub/inquiries/${encodeURIComponent(inquiry.id)}`, { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((data) => { if (!controller.signal.aborted) setDetail(data && typeof data === "object" ? data : { status: "error" }); })
      .catch(() => { if (!controller.signal.aborted) setDetail({ status: "error" }); });
    return () => controller.abort();
  }, [inquiry.id, reload]);

  const product = products.find((p) => p.id === inquiry.productId) || null;
  const projects = product ? (product.projects || []).filter((p) => p.status !== "completed" && p.status !== "archived") : [];
  const linked = product?.projects?.find((p) => p.id === inquiry.projectId) || null;
  const run = async (task, done) => {
    setBusy(true);
    setMessage("");
    const outcome = await task();
    setBusy(false);
    if (outcome?.ok === false) { setMessage(outcome.message); return; }
    if (done) toast(done);
    onChanged();
  };
  const setProduct = (productId) => run(() => linkInquiry(inquiry.id, productId || null, null), productId ? "제품을 골랐어요." : "제품 연결을 풀었어요.");
  const setProject = (projectId) => run(() => linkInquiry(inquiry.id, inquiry.productId, projectId || null), projectId ? "일에 붙였어요." : "일 연결을 풀었어요.");
  const setStatus = (status) => run(async () => {
    const row = detail.inquiry;
    if (!row?.updated_at) return { ok: false, message: "문의를 다시 불러온 뒤 바꿔 주세요." };
    try {
      await writeInquiry({ action: "update", id: inquiry.id, expectedUpdatedAt: row.updated_at, patch: { status } });
      setReload();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }, `상태를 ‘${INQUIRY_STATUSES[status]}’로 바꿨어요.`);

  const events = detail.status === "live" ? detail.events || [] : [];
  return (
    <div className={styles.detail}>
      {/* Button은 display를 인라인으로 가진다 — 폰에서만 보이게 하려면 감싸는 칸이 숨겨야 한다. */}
      <span className={styles.backButton}><Button variant="ghost" size="sm" onClick={onBack}>← 목록</Button></span>
      <div>
        <div className="eyebrow">{inquiryTime(inquiry.receivedAt)}</div>
        <h3 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600 }}>{inquiry.subject}</h3>
        <p className={styles.muted} style={{ marginTop: 2 }}>{[inquiry.contactName, inquiry.contactEmail].filter(Boolean).join(" · ") || "연락처 없음"}</p>
      </div>
      {detail.status === "loading" ? <Skeleton lines={4} height={13} label="문의 원문 불러오는 중" />
        : detail.status !== "live" ? <TruthBadge state="error" reason="원문을 읽지 못했어요" />
        : <blockquote className={styles.quote}>{events[0]?.body || "본문 없음"}</blockquote>}
      <div className={styles.fields}>
        <SelectField label="제품" value={inquiry.productId || ""} disabled={busy} onChange={(event) => setProduct(event.target.value)}
          options={[{ value: "", label: "제품 미정" }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
        <SelectField label="붙은 일" value={inquiry.projectId || ""} disabled={busy || !product} onChange={(event) => setProject(event.target.value)}
          options={[{ value: "", label: product ? "일 없음" : "제품부터 골라요" }, ...projects.map((p) => ({ value: p.id, label: `${workType(p.workType)?.glyph || "·"} ${p.name}` })),
            ...(linked && !projects.includes(linked) ? [{ value: linked.id, label: `${linked.name} (끝남)` }] : [])]} />
        <SelectField label="상태" value={inquiry.status} disabled={busy || detail.status !== "live"} onChange={(event) => setStatus(event.target.value)} options={STATUS_OPTIONS} />
      </div>
      {linked && (
        <p className={styles.muted}>
          {workType(linked.workType)?.label || "일"} · {projectStateLabel(linked.status)}
          {linked.tasks > 0 ? ` · 할 일 ${linked.tasksDone}/${linked.tasks}` : ""}
          {linked.requests > 1 ? ` · 같은 요청 ${linked.requests}건` : ""}
        </p>
      )}
      <div className={styles.bar}>
        {product && !inquiry.projectId && (
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => setCreating({ workType: "contact" })}>연락 만들기</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setCreating({ workType: "feature" })}>신기능으로</Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => window.location.assign(`/dashboard/revenue/inquiries?inquiry=${encodeURIComponent(inquiry.id)}`)}>문의 화면에서 열기 ↗</Button>
      </div>
      {message && <p role="alert" className={styles.danger} style={{ margin: 0, fontSize: 12 }}>{message}</p>}
      {events.length > 0 && (
        <section aria-label="연락 이력">
          <div className="eyebrow" style={{ marginBottom: 6 }}>연락 이력</div>
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className={styles.mini}>
              <span>{INQUIRY_SOURCES[event.source] || "문의"} · {event.subject}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{inquiryTime(event.received_at)}</span>
            </div>
          ))}
        </section>
      )}
      {creating && product && (
        <WorkDrawer product={product} areas={areas} seed={{ title: inquiry.subject, workType: creating.workType, inquiryId: inquiry.id }}
          onClose={() => setCreating(null)} onSaved={(done) => { setCreating(null); if (done) toast(done); onChanged(); }} />
      )}
    </div>
  );
}

export function ProductInbox({ inquiries, products, areas, selectedId, onSelect, onChanged }) {
  const [filter, setFilter] = React.useState("open");
  const [productFilter, setProductFilter] = React.useState("all");
  const [showDetail, setShowDetail] = React.useState(Boolean(selectedId));
  const productName = (id) => products.find((p) => p.id === id)?.name || null;
  const list = inquiries
    .filter(FILTERS.find((f) => f.key === filter).test)
    .filter((q) => productFilter === "all" || (productFilter === "none" ? !q.productId : q.productId === productFilter))
    .sort((a, b) => Number(Boolean(a.productId)) - Number(Boolean(b.productId)) || String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")));
  const selected = inquiries.find((q) => q.id === selectedId) || list[0] || null;
  const count = (f) => inquiries.filter(f.test).length;

  return (
    <>
      <div className={styles.bar}>
        <SegmentedControl label="문의 거르기" value={filter} onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: `${f.label} ${count(f)}` }))} />
        <span className={styles.spacer} />
        <SelectField aria-label="제품으로 거르기" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}
          options={[{ value: "all", label: "모든 제품" }, { value: "none", label: "제품 미정" }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>
      {!inquiries.length ? (
        <EmptyState icon="inbox" title="아직 문의가 없어요" description="메일·랜딩페이지·직접 등록 문의가 여기 모여요. 전화·대면 문의는 문의 화면에서 적을 수 있어요."
          action={<Button variant="outline" size="sm" onClick={() => window.location.assign("/dashboard/revenue/inquiries?new=inquiry")}>문의 적기</Button>} />
      ) : (
        <div className={`${styles.split}${showDetail ? ` ${styles.showDetail}` : ""}`}>
          <div className={styles.list} role="list" aria-label="문의">
            {list.length ? list.map((q) => (
              <div role="listitem" key={q.id}>
                <button type="button" className={`hub-row ${styles.listRow}`} aria-current={selected?.id === q.id ? "true" : undefined}
                  onClick={() => { onSelect(q.id); setShowDetail(true); }}>
                  <span className={styles.bar} style={{ gap: 8 }}>
                    <span className={styles.name} style={{ fontWeight: q.status === "new" ? 600 : 400 }}>{q.subject}</span>
                    <span className={styles.spacer} />
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{seoulDay(q.receivedAt)?.slice(5)}</span>
                  </span>
                  <span className={styles.sub}>
                    {q.status === "new" ? "새 · " : `${INQUIRY_STATUSES[q.status]} · `}
                    {productName(q.productId) || "제품 미정"}{q.contactName ? ` · ${q.contactName}` : ""}{q.projectId ? " · 일에 붙음" : ""}
                  </span>
                </button>
              </div>
            )) : <p className={styles.dim} style={{ padding: 14 }}>이 조건의 문의가 없어요.</p>}
          </div>
          {selected ? (
            <InquiryDetail key={selected.id} inquiry={selected} products={products} areas={areas}
              onBack={() => setShowDetail(false)} onChanged={onChanged} />
          ) : <div className={styles.detail}><p className={styles.dim}>문의를 고르세요.</p></div>}
        </div>
      )}
    </>
  );
}
