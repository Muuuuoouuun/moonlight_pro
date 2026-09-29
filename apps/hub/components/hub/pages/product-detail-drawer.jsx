"use client";
// 제품 상세 드로어 — 개요 · 개발 · 문의 세 탭 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §6).
// 개요 맨 위의 체크리스트가 "기획 → 기능 점검 → GitHub → 출시 → 에러·문의"를 진척률 하나로 묶는다(2026-09-25 운영자).
// 적합도 후보(4단계)는 아직 없고, 문의 탭은 "어떤 제품으로 들어온 문의인가"만 잇는다.
// 제품 카드 전체 편집은 "카드 편집"으로 EditDrawer에 넘긴다.
// 단계 게이트는 막지 않고 알려준다(§4.1): 빠진 칸이 있어도 올릴 수 있고, 유지·종료만 이유 한 줄이 필요하다.
import React from "react";
import { useRouter } from "next/navigation";

import { Button, Checkbox, Drawer, SectionTitle, SelectField, Tabs, TextField } from "../hub-primitives";
import { INQUIRY_STATUSES } from "../inquiry-view-state";
import { Iconed } from "../hub-icons";
import { useToast } from "../hub-toast";
import {
  CI_STATE_LABEL,
  PRODUCT_STAGES,
  formatPricing,
  gateSentence,
  productChecklist,
  productFeatures,
  productNextAction,
  productStageGate,
  productStageLabel,
  toggleFeatureVerified,
  withRo,
} from "../../../lib/product-catalog.js";
import {
  CODEX_DRAFT_KEY,
  buildCodexDraft,
  connectRepository,
  disconnectRepository,
  linkInquiry,
  linkProject,
  updateProduct,
} from "./product-client.js";

const PROJECT_STATUS_LABEL = { draft: "계획", active: "진행", blocked: "막힘", completed: "완료" };
const ORG_SCOPE_LABEL = { personal: "개인", classin: "ClassIn" };

function formatWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function Field({ label, children, empty }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 13 }}>
      <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>{label}</span>
      <span style={{ minWidth: 0, color: empty ? "var(--fg-dim)" : "var(--fg)", overflowWrap: "anywhere" }}>{empty ? "미정" : children}</span>
    </div>
  );
}

function ExternalLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)", textDecoration: "underline", textDecorationColor: "var(--line-strong)" }}>{children}</a>;
}

function StageControl({ product, ctx, onSaved }) {
  const [target, setTarget] = React.useState(product.stage);
  const [reason, setReason] = React.useState("");
  const [state, setState] = React.useState({ saving: false, message: "" });
  React.useEffect(() => { setTarget(product.stage); setReason(""); setState({ saving: false, message: "" }); }, [product.id, product.stage]);
  const gate = target !== product.stage ? productStageGate(product, target, ctx) : null;
  const needsReason = Boolean(gate?.needsReason);
  const save = async () => {
    if (needsReason && !reason.trim()) { setState({ saving: false, message: "유지·종료로 내리는 이유를 한 줄 남겨 주세요." }); return; }
    setState({ saving: true, message: "" });
    const outcome = await updateProduct({ id: product.id, expectedUpdatedAt: product.updatedAt, stage: target, ...(reason.trim() ? { stageReason: reason.trim() } : {}) });
    if (outcome.ok) { setState({ saving: false, message: "" }); onSaved(`단계를 ${withRo(productStageLabel(target))} 바꿨어요.`); return; }
    setState({ saving: false, message: outcome.message });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <SelectField aria-label="단계 선택" options={PRODUCT_STAGES.map((stage) => ({ value: stage.key, label: stage.label }))} value={target} onChange={(event) => setTarget(event.target.value)} fieldStyle={{ flex: "1 1 160px" }} />
        <Button variant="outline" size="sm" onClick={save} disabled={state.saving || target === product.stage}>
          {state.saving ? "저장 중…" : gate?.missing.length ? "빠진 칸 두고 올리기" : "단계 저장"}
        </Button>
      </div>
      {gate && gate.missing.length > 0 && (
        <ul aria-label={`${productStageLabel(target)} 단계 조건`} style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg-muted)" }}>
          {gate.missing.map((item) => (
            <li key={item.key} style={{ display: "flex", gap: 6, alignItems: "baseline" }}><span aria-hidden="true">○</span>{gateSentence(target, item)}</li>
          ))}
        </ul>
      )}
      {gate && gate.unknown.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-dim)" }}>
          확인 필요: {gate.unknown.map((item) => item.label).join(", ")} — 아직 Moonlight가 읽는 원천이 없어요.
        </p>
      )}
      {(needsReason || (gate && target !== product.stage)) && (
        <TextField label={needsReason ? "이유 한 줄" : "바꾸는 이유 (선택)"} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder={needsReason ? "예: 수요 확인 실패, 유지보수만" : ""} />
      )}
      {state.message && <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--danger)" }}>{state.message}</p>}
    </div>
  );
}

function seoulToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const CHECK_GLYPH = { done: "check", todo: null, unknown: null, info: null };

function ChecklistSection({ product, onEdit, onTab, onSaved }) {
  const checklist = productChecklist(product);
  const [openFeatures, setOpenFeatures] = React.useState(false);
  const [saving, setSaving] = React.useState(null);
  const [error, setError] = React.useState("");
  const features = productFeatures(product);
  const toggle = async (feature, checked) => {
    setSaving(feature.id);
    setError("");
    const outcome = await updateProduct({
      id: product.id,
      expectedUpdatedAt: product.updatedAt,
      details: { capabilities: toggleFeatureVerified(product, feature.id, checked, seoulToday()) },
    });
    setSaving(null);
    if (outcome.ok) onSaved(null);
    else setError(outcome.message);
  };
  const goTo = (entry) => {
    if (entry.expandable) { setOpenFeatures((open) => !open); return; }
    if (entry.tab) { onTab(entry.tab); return; }
    if (entry.field) onEdit();
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionTitle right={<span style={{ fontSize: 12, color: "var(--fg-muted)" }}><span className="stat" style={{ fontSize: 20, color: "var(--fg)" }}>{checklist.percent}%</span> · <span className="num">{checklist.done}/{checklist.total}</span></span>}>
        체크리스트
      </SectionTitle>
      {checklist.groups.map((group) => (
        <div key={group.key} style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
          <span style={{ fontSize: 12, color: "var(--fg-dim)", paddingTop: 7 }}>{group.label}</span>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {group.items.map((entry) => {
              const actionable = entry.expandable || entry.tab || (entry.state === "todo" && entry.field);
              const body = (
                <>
                  <span aria-hidden="true" style={{ width: 14, flex: "none", textAlign: "center", color: entry.state === "done" ? "var(--fg-muted)" : "var(--fg-dim)" }}>
                    {CHECK_GLYPH[entry.state] ? <Iconed name="check" size={12} /> : entry.state === "unknown" ? "?" : entry.state === "info" ? "·" : "○"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: entry.state === "done" ? "var(--fg-muted)" : "var(--fg)" }}>{entry.label}</span>
                  {entry.detail && <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-dim)", flex: "none" }}>{entry.detail}</span>}
                  {entry.state === "unknown" && !entry.detail && <span style={{ fontSize: 11.5, color: "var(--fg-dim)", flex: "none" }}>확인 필요</span>}
                </>
              );
              const rowStyle = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 4px", fontSize: 13, textAlign: "left", border: 0, background: "transparent", color: "inherit", font: "inherit" };
              return (
                <li key={entry.key}>
                  {actionable ? (
                    <button type="button" className="hub-row" style={rowStyle} onClick={() => goTo(entry)}
                      aria-expanded={entry.expandable ? openFeatures : undefined}
                      aria-label={`${entry.label}${entry.detail ? ` ${entry.detail}` : ""}, ${entry.state === "done" ? "완료" : entry.state === "todo" ? "할 일" : entry.state === "unknown" ? "확인 필요" : "현황"}`}>
                      {body}
                    </button>
                  ) : <div style={rowStyle}>{body}</div>}
                  {entry.expandable && openFeatures && (
                    <ul aria-label="기능 점검" style={{ margin: "2px 0 6px 26px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                      {features.map((feature) => (
                        <li key={feature.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, fontSize: 13 }}>
                          <Checkbox checked={Boolean(feature.verifiedAt)} disabled={saving !== null} label={`${feature.text} 점검`} onChange={(checked) => toggle(feature, checked)} />
                          <span style={{ flex: 1, minWidth: 0, color: feature.verifiedAt ? "var(--fg-muted)" : "var(--fg)" }}>{feature.text}</span>
                          {feature.verifiedAt && <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>점검 {feature.verifiedAt.slice(5)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}

function OverviewPanel({ product, ctx, onEdit, onTab, onSaved }) {
  const details = product.details || {};
  const next = productNextAction(product, ctx);
  const history = [...(product.stageHistory || [])].reverse();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{product.summary}</p>
      {next && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "var(--fg-muted)" }}>
          <span>다음 행동 · <b style={{ color: "var(--fg)", fontWeight: 500 }}>{next.text}</b></span>
          {next.missing?.field && <Button variant="ghost" size="sm" icon="edit" onClick={onEdit}>칸 채우기</Button>}
          {next.missing?.tab && next.missing.tab !== "checklist" && <Button variant="ghost" size="sm" onClick={() => onTab(next.missing.tab)}>개발 탭 열기</Button>}
        </div>
      )}
      <ChecklistSection product={product} onEdit={onEdit} onTab={onTab} onSaved={onSaved} />
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle>단계</SectionTitle>
        <StageControl product={product} ctx={ctx} onSaved={onSaved} />
      </section>
      <section>
        <SectionTitle>제품 카드</SectionTitle>
        <Field label="분야" empty={!details.domain}>{details.domain}</Field>
        <Field label="대상 고객" empty={!details.audience}>{details.audience}</Field>
        <Field label="해결하는 문제" empty={!details.problem}>{details.problem}</Field>
        <Field label="필수 조건" empty={!details.requirements?.length}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{(details.requirements || []).map((item) => <li key={item.id}>{item.text}</li>)}</ul>
        </Field>
        <Field label="가격">{formatPricing(details.pricing)}</Field>
        <Field label="배포 URL" empty={!details.deployUrl}>{details.deployUrl && <ExternalLink href={details.deployUrl}>{details.deployUrl}</ExternalLink>}</Field>
        {details.links?.length > 0 && (
          <Field label="링크">
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {details.links.map((link) => <ExternalLink key={link.url} href={link.url}>{link.label}</ExternalLink>)}
            </span>
          </Field>
        )}
        <Field label="특이사항" empty={!details.notes}><span style={{ whiteSpace: "pre-wrap" }}>{details.notes}</span></Field>
      </section>
      {history.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: "var(--fg-dim)", cursor: "pointer" }}>단계 이력 <span className="num">{history.length}</span></summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg-muted)" }}>
            {history.slice(0, 10).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", marginRight: 8 }}>{formatWhen(entry.at)}</span>
                {entry.from ? `${productStageLabel(entry.from)} → ` : ""}{productStageLabel(entry.to)}{entry.reason ? ` · ${entry.reason}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function InquiriesPanel({ product, candidates, onChanged, onOpenInquiry }) {
  const [choice, setChoice] = React.useState("");
  const [state, setState] = React.useState({ busy: null, message: "" });
  const run = async (inquiryId, productId, doneMessage) => {
    setState({ busy: inquiryId, message: "" });
    const outcome = await linkInquiry(inquiryId, productId);
    if (outcome.ok) { setState({ busy: null, message: "" }); setChoice(""); onChanged(doneMessage); return; }
    setState({ busy: null, message: outcome.message });
  };
  const inquiries = product.inquiries || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg-muted)" }}>이 제품으로 들어온 문의예요. 문의 상세에서도 제품을 고를 수 있어요.</p>
      {inquiries.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--line-soft)" }}>
              <button type="button" className="hub-row" onClick={() => onOpenInquiry(inquiry.id)} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "10px 4px", border: 0, background: "transparent", color: "var(--fg)", font: "inherit", textAlign: "left" }}>
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inquiry.subject}</span>
                <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  {INQUIRY_STATUSES[inquiry.status] || inquiry.status}{inquiry.contactName ? ` · ${inquiry.contactName}` : ""}
                  {inquiry.receivedAt && <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", marginLeft: 6 }}>{formatWhen(inquiry.receivedAt)}</span>}
                </span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => run(inquiry.id, null, "문의를 이 제품에서 뺐어요.")} disabled={state.busy === inquiry.id}>빼기</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg-dim)" }}>아직 이 제품에 연결된 문의가 없어요.</p>
      )}
      {candidates.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <SelectField
            label="최근 문의 붙이기"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            options={[{ value: "", label: "문의 선택" }, ...candidates.map((inquiry) => ({ value: inquiry.id, label: `${inquiry.subject}${inquiry.contactName ? ` · ${inquiry.contactName}` : ""}` }))]}
            fieldStyle={{ flex: "1 1 220px" }}
          />
          <Button variant="outline" size="sm" icon="link" disabled={!choice || Boolean(state.busy)} onClick={() => run(choice, product.id, "문의를 이 제품에 붙였어요.")}>붙이기</Button>
        </div>
      )}
      {state.message && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
    </div>
  );
}

function CiLine({ repository }) {
  const ci = repository.summary?.ci;
  const state = ci?.state;
  if (!state) return <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>CI 상태 아직 모름 · 동기화 필요</span>;
  const failed = state === "failure";
  return (
    <span style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, color: failed ? "var(--danger)" : "var(--fg-muted)" }}>
      <Iconed name={failed ? "x" : state === "success" ? "check" : "clock"} size={12} />
      CI {CI_STATE_LABEL[state] || state}{failed && ci.failed?.length ? ` · ${ci.failed.join(", ")}` : ""}
    </span>
  );
}

function RepositoryRow({ product, repository, onChanged, onCodex }) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const summary = repository.summary || {};
  const failed = summary.ci?.state === "failure";
  const disconnect = async () => {
    setBusy(true);
    const outcome = await disconnectRepository(repository.id);
    setBusy(false);
    if (outcome.ok) { onChanged(`${repository.fullName} 연결을 해제했어요.`); return; }
    setError(outcome.message);
  };
  return (
    <li style={{ padding: "10px 0 10px 10px", borderBottom: "1px solid var(--line-soft)", boxShadow: failed ? "inset 1px 0 0 var(--danger)" : undefined, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <ExternalLink href={`https://github.com/${repository.fullName}`}><span className="mono" style={{ fontSize: 12.5 }}>{repository.fullName}</span></ExternalLink>
        <span style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>{repository.role} · {repository.defaultBranch}</span>
        {repository.status === "disabled" && <span style={{ fontSize: 11.5, color: "var(--fg-dim)" }}>꺼짐</span>}
      </div>
      <CiLine repository={repository} />
      <div style={{ fontSize: 12, color: "var(--fg-muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Number.isFinite(summary.reviewRequests) && <span>리뷰 요청 <span className="num">{summary.reviewRequests}</span></span>}
        {Number.isFinite(summary.openPullRequests) && <span>열린 PR <span className="num">{summary.openPullRequests}</span></span>}
        {summary.latestRelease?.tag && <span>릴리스 <span className="mono">{summary.latestRelease.tag}</span></span>}
        <span>동기화 <span className="mono">{formatWhen(repository.lastSyncedAt) || "전"}</span></span>
      </div>
      {repository.status === "error" && repository.lastError && <span style={{ fontSize: 12, color: "var(--danger)" }}>동기화 실패 · {repository.lastError}</span>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {failed && summary.ci?.url && <ExternalLink href={summary.ci.url}><span style={{ fontSize: 12 }}>실패 로그</span></ExternalLink>}
        {failed && <Button variant="outline" size="sm" icon="orders" onClick={() => onCodex(product, repository)}>Codex에 맡기기</Button>}
        <div style={{ flex: 1 }} />
        {confirming ? (
          <>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>연결만 끊어요. 지난 신호는 남아요.</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>취소</Button>
            <Button variant="danger" size="sm" onClick={disconnect} disabled={busy}>{busy ? "해제 중…" : "연결 해제"}</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>연결 해제</Button>
        )}
      </div>
      {error && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </li>
  );
}

function ConnectRepositoryForm({ product, onChanged }) {
  const [draft, setDraft] = React.useState({ fullName: "", defaultBranch: "", role: "" });
  const [state, setState] = React.useState({ saving: false, message: "" });
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.fullName.trim()) return;
    setState({ saving: true, message: "" });
    const outcome = await connectRepository({
      productId: product.id,
      fullName: draft.fullName.trim(),
      defaultBranch: draft.defaultBranch.trim() || "main",
      role: draft.role.trim() || "app",
    });
    if (outcome.ok) {
      setDraft({ fullName: "", defaultBranch: "", role: "" });
      setState({ saving: false, message: "" });
      onChanged("저장소를 연결했어요. 동기화하면 CI 상태가 들어와요.");
      return;
    }
    setState({ saving: false, message: outcome.message });
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TextField label="저장소 연결" placeholder="owner/repo 또는 GitHub 주소" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} maxLength={300} />
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <TextField label="기본 브랜치" placeholder="main" value={draft.defaultBranch} onChange={(event) => setDraft({ ...draft, defaultBranch: event.target.value })} maxLength={100} fieldStyle={{ flex: "1 1 120px" }} />
        <TextField label="역할" placeholder="app · api · worker" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} maxLength={30} fieldStyle={{ flex: "1 1 120px" }} />
        <Button type="submit" variant="outline" size="sm" icon="link" disabled={state.saving || !draft.fullName.trim()}>{state.saving ? "연결 중…" : "연결"}</Button>
      </div>
      {state.message && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
    </form>
  );
}

function ProjectLinks({ product, candidates, onChanged, onOpenProject }) {
  const [choice, setChoice] = React.useState("");
  const [state, setState] = React.useState({ busy: null, message: "" });
  const link = async (projectId, productId, doneMessage) => {
    setState({ busy: projectId, message: "" });
    const outcome = await linkProject(projectId, productId);
    if (outcome.ok) { setState({ busy: null, message: "" }); setChoice(""); onChanged(doneMessage); return; }
    setState({ busy: null, message: outcome.message });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {product.projects.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {product.projects.map((project) => (
            <li key={project.id} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--line-soft)" }}>
              <button type="button" className="hub-row" onClick={() => onOpenProject?.(project.id)} style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 4px", border: 0, background: "transparent", color: "var(--fg)", font: "inherit", fontSize: 13, textAlign: "left" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                <span style={{ fontSize: 12, color: project.status === "blocked" ? "var(--danger)" : "var(--fg-muted)", flex: "none" }}>{PROJECT_STATUS_LABEL[project.status] || project.status}</span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => link(project.id, null, `‘${project.name}’을 이 제품에서 뺐어요.`)} disabled={state.busy === project.id}>빼기</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg-dim)" }}>아직 이 제품에 붙은 프로젝트가 없어요.</p>
      )}
      {candidates.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <SelectField
            label="프로젝트 붙이기"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            options={[{ value: "", label: "프로젝트 선택" }, ...candidates.map((project) => ({ value: project.id, label: `${project.name}${project.orgScope && project.orgScope !== product.orgScope ? ` · ${ORG_SCOPE_LABEL[project.orgScope] || project.orgScope}` : ""}` }))]}
            fieldStyle={{ flex: "1 1 200px" }}
          />
          <Button variant="outline" size="sm" icon="link" disabled={!choice || Boolean(state.busy)} onClick={() => {
            const project = candidates.find((item) => item.id === choice);
            link(choice, product.id, `‘${project?.name || "프로젝트"}’을 붙였어요.`);
          }}>붙이기</Button>
        </div>
      )}
      {state.message && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
    </div>
  );
}

function DevPanel({ product, candidates, github, onChanged, onOpenProject, onSyncGitHub, syncing, onCodex }) {
  const setupNotes = [];
  if (github.state === "live" && !github.tokenConfigured) setupNotes.push("GITHUB_TOKEN(읽기 전용)이 없어 공개 저장소만 읽혀요.");
  if (github.state === "live" && !github.webhookSecretConfigured) setupNotes.push("GITHUB_WEBHOOK_SECRET이 없어 즉시 신호(webhook)는 꺼져 있어요. 동기화 버튼과 하루 1회 cron만 돌아요.");
  if (github.state === "preview") setupNotes.push("Engine 연결이 없어 GitHub을 읽지 못해요.");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle right={<Button variant="ghost" size="sm" icon="refresh" onClick={onSyncGitHub} disabled={syncing}>{syncing ? "동기화 중…" : "동기화"}</Button>}>저장소</SectionTitle>
        {setupNotes.map((note) => <p key={note} style={{ margin: 0, fontSize: 12, color: "var(--fg-dim)" }}>{note}</p>)}
        {product.repositories.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {product.repositories.map((repository) => (
              <RepositoryRow key={repository.id} product={product} repository={repository} onChanged={onChanged} onCodex={onCodex} />
            ))}
          </ul>
        )}
        <ConnectRepositoryForm product={product} onChanged={onChanged} />
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle>프로젝트</SectionTitle>
        <ProjectLinks product={product} candidates={candidates} onChanged={onChanged} onOpenProject={onOpenProject} />
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle>최근 신호</SectionTitle>
        {product.signals.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {product.signals.map((signal) => (
              <li key={signal.id} style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 12.5 }}>
                <span style={{ minWidth: 0, display: "inline-flex", gap: 6, alignItems: "center", color: signal.status === "blocked" ? "var(--danger)" : "var(--fg)" }}>
                  {signal.status === "blocked" && <Iconed name="x" size={12} />}
                  {signal.url ? <ExternalLink href={signal.url}>{signal.title}</ExternalLink> : signal.title}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)", flex: "none" }}>{formatWhen(signal.happenedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg-dim)" }}>아직 들어온 신호가 없어요. CI 실패·PR·릴리스가 여기에 쌓여요.</p>
        )}
      </section>
    </div>
  );
}

export function ProductDetailDrawer({ product, candidates, inquiryCandidates = [], github, onClose, onEdit, onChanged, onOpenProject, onSyncGitHub, syncing }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState("overview");
  React.useEffect(() => { setTab("overview"); }, [product.id]);
  const ctx = { repositories: product.repositories.length, projects: product.projects.length };
  const changed = React.useCallback((message) => {
    if (message) toast(message);
    onChanged?.();
  }, [onChanged, toast]);
  const openCodex = React.useCallback((target, repository) => {
    try {
      window.sessionStorage.setItem(CODEX_DRAFT_KEY, JSON.stringify({ prompt: buildCodexDraft(target, repository), at: Date.now() }));
    } catch {
      toast.error("초안을 넘기지 못했어요. 코드 작업 화면에서 직접 적어 주세요.");
    }
    router.push("/dashboard/agents/orders?view=jobs");
  }, [router, toast]);
  const blockedCount = product.repositories.filter((repository) => repository.summary?.ci?.state === "failure").length;
  return (
    <Drawer
      title={product.name}
      subtitle={`${productStageLabel(product.stage)} · ${ORG_SCOPE_LABEL[product.orgScope] || product.orgScope} · v${product.version}`}
      onClose={onClose}
      width="min(560px, 96vw)"
      footer={<><div style={{ flex: 1 }} /><Button variant="ghost" size="sm" onClick={onClose}>닫기</Button><Button variant="outline" size="sm" icon="edit" onClick={onEdit}>카드 편집</Button></>}
    >
      <Tabs
        ariaLabel="제품 상세"
        tabs={[
          { key: "overview", label: "개요" },
          { key: "dev", label: "개발", count: blockedCount || undefined },
          { key: "inquiries", label: "문의", count: product.inquiries?.length || undefined },
        ]}
        active={tab}
        onChange={setTab}
        style={{ margin: "-16px -16px 16px", padding: "0 16px" }}
      />
      <div role="tabpanel" aria-label="개요" hidden={tab !== "overview"}>
        <OverviewPanel product={product} ctx={ctx} onEdit={onEdit} onTab={setTab} onSaved={changed} />
      </div>
      <div role="tabpanel" aria-label="개발" hidden={tab !== "dev"}>
        <DevPanel product={product} candidates={candidates} github={github} onChanged={changed} onOpenProject={onOpenProject} onSyncGitHub={onSyncGitHub} syncing={syncing} onCodex={openCodex} />
      </div>
      <div role="tabpanel" aria-label="문의" hidden={tab !== "inquiries"}>
        <InquiriesPanel product={product} candidates={inquiryCandidates} onChanged={changed}
          onOpenInquiry={(id) => router.push(`/dashboard/revenue/inquiries?inquiry=${encodeURIComponent(id)}`)} />
      </div>
    </Drawer>
  );
}
