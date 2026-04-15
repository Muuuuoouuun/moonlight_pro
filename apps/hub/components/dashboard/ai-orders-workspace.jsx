"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  AI_TARGETS as TARGETS,
  getAiOrderTone,
  normalizeAiTarget,
} from "@/lib/ai-console";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

const PRIORITIES = [
  { id: "P0", label: "P0 · 긴급" },
  { id: "P1", label: "P1 · 오늘" },
  { id: "P2", label: "P2 · 이번 주" },
  { id: "P3", label: "P3 · 백로그" },
];

const LANES = ["Hub UX", "Engine", "Content", "Automations", "Revenue", "Work OS"];

const DEFAULT_FORM = {
  title: "",
  target: TARGETS[0].id,
  priority: PRIORITIES[1].id,
  lane: LANES[0],
  due: "",
  note: "",
};

function resolveTargetId(label) {
  return normalizeAiTarget(label || "claude");
}

function fillTemplatePrompt(prompt) {
  return String(prompt || "")
    .replaceAll("{{task}}", "여기에 구체 작업을 적기")
    .replaceAll("{{topic}}", "여기에 주제를 적기");
}

export function AiOrdersWorkspace({ initialOpenOrders, initialOrderTemplates, initialDraft = null }) {
  const [orders, setOrders] = useState(initialOpenOrders || []);
  const [form, setForm] = useState(initialDraft ? { ...DEFAULT_FORM, ...initialDraft } : DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(initialOpenOrders?.[0]?.id || null);
  const [pending, setPending] = useState(false);
  const [activityNote, setActivityNote] = useState(
    initialDraft?.source
      ? `"${initialDraft.source}" 에서 넘어온 오더 초안을 폼에 채웠습니다. 필요하면 바로 수정해서 큐에 넣으세요.`
      : "이제 실제 /api/ai/orders 응답을 먹습니다. 생성, 수정, 재배정은 저장 가능 환경이면 Supabase에, 아니면 preview로 반영됩니다.",
  );

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;
  const running = orders.filter((order) => order.status === "실행 중").length;
  const waitingReview = orders.filter((order) => order.status === "리뷰 대기").length;
  const queued = orders.filter((order) => order.status === "큐 대기").length;
  const done = orders.filter((order) => order.status === "완료").length;

  useEffect(() => {
    setOrders(initialOpenOrders || []);
    setSelectedOrderId(initialOpenOrders?.[0]?.id || null);
  }, [initialOpenOrders]);

  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    setEditingId(null);
    setForm({
      ...DEFAULT_FORM,
      ...initialDraft,
    });
    setActivityNote(
      initialDraft.source
        ? `"${initialDraft.source}" 에서 넘어온 오더 초안을 폼에 채웠습니다. 필요하면 바로 수정해서 큐에 넣으세요.`
        : "외부에서 넘어온 오더 초안을 폼에 채웠습니다.",
    );
  }, [initialDraft]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  }

  function handleSaveDraft() {
    setActivityNote(
      form.title.trim()
        ? `"${form.title}" 오더 초안을 폼 상태로 유지했습니다. 바로 발송하지 않아도 다시 이어서 수정할 수 있습니다.`
        : "제목 없이도 현재 폼 상태를 초안처럼 유지했습니다. 템플릿이나 레인만 먼저 맞춰둘 수 있습니다.",
    );
  }

  function handleTemplateUse(template) {
    setForm({
      title: template.title,
      target: resolveTargetId(template.target),
      priority: PRIORITIES[1].id,
      lane: LANES[0],
      due: "오늘 17:00",
      note: fillTemplatePrompt(template.prompt),
    });
    setEditingId(null);
    setActivityNote(`"${template.title}" 템플릿을 폼에 채웠습니다. 바로 수정해서 발송하면 됩니다.`);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.note.trim()) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/ai/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          id: editingId || undefined,
          title: form.title.trim(),
          target: form.target,
          priority: form.priority,
          lane: form.lane,
          due: form.due.trim() || "오늘",
          note: form.note.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Order request failed.");
      }

      const nextOrder = data.order;

      setOrders((current) => {
        if (editingId) {
          return current.map((order) => (order.id === editingId ? nextOrder : order));
        }

        return [nextOrder, ...current.filter((order) => order.id !== nextOrder.id)];
      });
      setSelectedOrderId(nextOrder.id);
      setActivityNote(data.message || `"${nextOrder.title}" 오더를 반영했습니다.`);
      resetForm();
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function handleEdit(order) {
    setEditingId(order.id);
    setSelectedOrderId(order.id);
    setForm({
      title: order.title,
      target: resolveTargetId(order.target),
      priority: order.priority,
      lane: order.lane,
      due: order.due,
      note: order.note,
    });
    setActivityNote(`"${order.title}" 오더를 편집 모드로 올렸습니다. 저장하면 같은 카드가 갱신됩니다.`);
  }

  async function handleReassign(order) {
    const currentIndex = TARGETS.findIndex((item) => item.label === order.target);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % TARGETS.length;
    const nextTarget = TARGETS[nextIndex];

    setPending(true);

    try {
      const response = await fetch("/api/ai/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "reassign",
          id: order.id,
          title: order.title,
          target: nextTarget.id,
          priority: order.priority,
          lane: order.lane,
          due: order.due,
          note: order.note,
          status: order.status === "큐 대기" ? "running" : order.status,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Order reassign failed.");
      }

      setOrders((current) => current.map((item) => (item.id === order.id ? data.order : item)));
      setSelectedOrderId(data.order.id);
      setActivityNote(data.message || `"${order.title}" 오더를 재배정했습니다.`);
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  function handleViewLog(order) {
    setSelectedOrderId(order.id);
    setActivityNote(`"${order.title}" 오더 로그를 아래 패널에 열었습니다. 상태, 우선순위, 마감, 지시사항을 한 번에 볼 수 있습니다.`);
  }

  return (
    <>
      <section className="summary-grid" aria-label="Orders summary">
        <SummaryCard
          title="실행 중"
          value={String(running)}
          detail="에이전트가 지금 붙잡고 있는 오더."
          badge="Live"
          tone="blue"
        />
        <SummaryCard
          title="리뷰 대기"
          value={String(waitingReview)}
          detail="에이전트가 결과를 내놓고 승인 대기 중인 오더."
          badge="Review"
          tone="warning"
        />
        <SummaryCard
          title="큐 대기"
          value={String(queued)}
          detail="배정되지 않았거나 선행 작업이 안 끝난 오더."
          badge="Queue"
          tone="muted"
        />
        <SummaryCard
          title="오늘 완료"
          value={String(done)}
          detail="에이전트가 오늘 마친 오더 수."
          badge="Done"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="New Order"
          title="오더 때리기"
          description="한 번에 하나의 결과만 나오도록. 지금은 실제 API 응답을 통해 작성, 수정, 재배정 흐름을 검증합니다."
        >
          <form
            className="ai-order-form"
            aria-label="Dispatch a new order"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className="ai-order-form-grid">
              <div className="ai-order-field">
                <label htmlFor="order-title" className="section-kicker">
                  제목
                </label>
                <input
                  id="order-title"
                  name="title"
                  type="text"
                  placeholder="예: AI 콘솔 오더 폼 실제 POST 배선"
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-target" className="section-kicker">
                  타겟
                </label>
                <select
                  id="order-target"
                  name="target"
                  value={form.target}
                  onChange={(event) => updateField("target", event.target.value)}
                  disabled={pending}
                >
                  {TARGETS.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-priority" className="section-kicker">
                  우선순위
                </label>
                <select
                  id="order-priority"
                  name="priority"
                  value={form.priority}
                  onChange={(event) => updateField("priority", event.target.value)}
                  disabled={pending}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority.id} value={priority.id}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-lane" className="section-kicker">
                  레인
                </label>
                <select
                  id="order-lane"
                  name="lane"
                  value={form.lane}
                  onChange={(event) => updateField("lane", event.target.value)}
                  disabled={pending}
                >
                  {LANES.map((lane) => (
                    <option key={lane} value={lane}>
                      {lane}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-due" className="section-kicker">
                  마감
                </label>
                <input
                  id="order-due"
                  name="due"
                  type="text"
                  placeholder="예: 오늘 17:00"
                  value={form.due}
                  onChange={(event) => updateField("due", event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="ai-order-field ai-order-field-full">
                <label htmlFor="order-note" className="section-kicker">
                  지시사항
                </label>
                <textarea
                  id="order-note"
                  name="note"
                  rows={4}
                  placeholder="무엇을 원하고, 어떤 파일/범위를 건드리며, 완료의 기준이 무엇인지."
                  value={form.note}
                  onChange={(event) => updateField("note", event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="ai-chat-composer-actions">
              <p className="muted tiny">{activityNote}</p>
              <div className="hero-actions">
                <button type="button" className="button button-secondary" onClick={handleSaveDraft} disabled={pending}>
                  초안 저장
                </button>
                <button type="submit" className="button button-primary" disabled={!form.title.trim() || !form.note.trim() || pending}>
                  {pending ? "처리 중..." : editingId ? "오더 수정" : "오더 발송"}
                </button>
              </div>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          kicker="Templates"
          title="반복 오더 템플릿"
          description="자주 쓰는 오더는 템플릿으로 굳혀두고, 클릭 한 번으로 위 폼을 채웁니다."
        >
          <ul className="note-list">
            {(initialOrderTemplates || []).map((template) => (
              <li className="note-row" key={template.id}>
                <div>
                  <strong>{template.title}</strong>
                  <p>
                    <code>{template.prompt}</code>
                  </p>
                </div>
                <div className="hero-actions">
                  <span className="legend-chip" data-tone="blue">
                    {template.target}
                  </span>
                  <button type="button" className="button button-ghost" onClick={() => handleTemplateUse(template)} disabled={pending}>
                    폼 채우기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Open Orders"
        title="오픈 오더"
        description="카드 하나 = 하나의 실행 단위. 상태, 마감, 에이전트, 노트까지 한 장에서 드러냅니다."
        action={
          <Link className="button button-ghost" href="/dashboard/ai">
            Overview로 →
          </Link>
        }
      >
        {selectedOrder ? (
          <div className="status-note ai-order-log" data-tone={selectedOrder.tone}>
            <strong>{selectedOrder.title}</strong>
            <p>{`${selectedOrder.target} · ${selectedOrder.status} · ${selectedOrder.priority} · ${selectedOrder.due}`}</p>
            <p>{selectedOrder.note}</p>
          </div>
        ) : null}
        <div className="project-grid">
          {orders.map((order) => (
            <article className="project-card" key={order.id}>
              <div className="project-head">
                <div>
                  <h3>{order.title}</h3>
                  <p>
                    {order.lane} · {order.target}
                  </p>
                </div>
                <span className="legend-chip" data-tone={order.tone || getAiOrderTone(order.status)}>
                  {order.status}
                </span>
              </div>
              <div className="detail-stack">
                <div>
                  <dt>Priority</dt>
                  <dd>{order.priority}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{order.due}</dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{order.note}</dd>
                </div>
              </div>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <button type="button" className="button button-ghost" onClick={() => handleEdit(order)} disabled={pending}>
                  수정
                </button>
                <button type="button" className="button button-secondary" onClick={() => handleReassign(order)} disabled={pending}>
                  재배정
                </button>
                <button type="button" className="button button-primary" onClick={() => handleViewLog(order)}>
                  로그 보기
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
