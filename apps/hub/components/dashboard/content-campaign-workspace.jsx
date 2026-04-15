"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { CONTENT_BRANDS, getContentBrandLabel } from "@/lib/dashboard-contexts";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

function getDefaultBrand(selectedBrand) {
  if (selectedBrand && selectedBrand !== "all") {
    return selectedBrand;
  }

  return CONTENT_BRANDS.find((item) => item.value !== "all")?.value || "sinabro";
}

function buildEmptyForm(selectedBrand) {
  return {
    title: "",
    brandKey: getDefaultBrand(selectedBrand),
    channel: "Email + Publish",
    status: "draft",
    goal: "",
    nextAction: "",
    handoff: "Content -> Publish -> Email",
    startDate: "",
    endDate: "",
  };
}

function buildEmailHref(campaign) {
  if (!campaign) {
    return "/dashboard/automations/email";
  }

  const params = new URLSearchParams({
    campaign: campaign.id,
    segment: campaign.emailHandoff?.segmentId || "all",
  });

  return `/dashboard/automations/email?${params.toString()}`;
}

function buildOrdersHref(campaign) {
  if (!campaign?.aiOrderDraft) {
    return "/dashboard/ai/orders";
  }

  const params = new URLSearchParams({
    title: campaign.aiOrderDraft.title,
    target: campaign.aiOrderDraft.target,
    priority: campaign.aiOrderDraft.priority,
    lane: campaign.aiOrderDraft.lane,
    due: campaign.aiOrderDraft.due,
    note: campaign.aiOrderDraft.note,
    source: campaign.title,
  });

  return `/dashboard/ai/orders?${params.toString()}`;
}

export function ContentCampaignWorkspace({
  initialCampaigns,
  initialRuns,
  selectedBrand,
  initialSelectedId = null,
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns || []);
  const [runs, setRuns] = useState(initialRuns || []);
  const [selectedId, setSelectedId] = useState(
    initialCampaigns?.find((item) => item.id === initialSelectedId)?.id ||
      initialCampaigns?.[0]?.id ||
      null,
  );
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => buildEmptyForm(selectedBrand));
  const [pending, setPending] = useState(false);
  const [activityNote, setActivityNote] = useState(
    "캠페인을 생성하거나 수정한 뒤 바로 handoff 를 큐에 올릴 수 있습니다. Email과 AI Orders는 같은 brief를 그대로 이어받습니다.",
  );

  useEffect(() => {
    setCampaigns(initialCampaigns || []);
    setRuns(initialRuns || []);
    setSelectedId(
      initialCampaigns?.find((item) => item.id === initialSelectedId)?.id ||
        initialCampaigns?.[0]?.id ||
        null,
    );
    setEditingId(null);
    setForm(buildEmptyForm(selectedBrand));
  }, [initialCampaigns, initialRuns, initialSelectedId, selectedBrand]);

  const selectedCampaign = campaigns.find((item) => item.id === selectedId) || null;
  const selectedRuns = selectedCampaign
    ? runs.filter((item) => item.campaignId === selectedCampaign.id)
    : runs.slice(0, 6);

  const liveCount = campaigns.filter((item) => item.status === "active").length;
  const queuedCount = runs.filter((item) => item.status === "queued" || item.status === "running").length;
  const brandCount = new Set(campaigns.map((item) => item.brand).filter(Boolean)).size;
  const completedCount = campaigns.filter((item) => item.status === "completed").length;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(buildEmptyForm(selectedBrand));
  }

  function handleSelectCampaign(campaign) {
    setSelectedId(campaign.id);
    setEditingId(null);
    setActivityNote(`"${campaign.title}" 캠페인을 열었습니다. 아래에서 brief, handoff, 관련 출력물을 같이 볼 수 있습니다.`);
  }

  function handleEditCampaign(campaign) {
    setSelectedId(campaign.id);
    setEditingId(campaign.id);
    setForm({
      title: campaign.title,
      brandKey: campaign.brand || getDefaultBrand(selectedBrand),
      channel: campaign.channel,
      status: campaign.status,
      goal: campaign.goal,
      nextAction: campaign.nextAction,
      handoff: campaign.handoff,
      startDate: campaign.startDate || "",
      endDate: campaign.endDate || "",
    });
    setActivityNote(`"${campaign.title}" 캠페인을 편집 모드로 올렸습니다. 저장하면 같은 카드가 갱신됩니다.`);
  }

  async function handleSubmit(actionOverride) {
    if (!form.title.trim() || !form.channel.trim()) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/content/campaigns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: actionOverride || (editingId ? "update" : "create"),
          id: editingId || undefined,
          title: form.title.trim(),
          brandKey: form.brandKey,
          channel: form.channel.trim(),
          status: form.status,
          goal: form.goal.trim(),
          nextAction: form.nextAction.trim(),
          handoff: form.handoff.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Campaign request failed.");
      }

      if (data.campaign) {
        setCampaigns((current) => [
          data.campaign,
          ...current.filter((item) => item.id !== data.campaign.id),
        ]);
        setSelectedId(data.campaign.id);
      }

      if (data.run) {
        setRuns((current) => [data.run, ...current]);
      }

      setActivityNote(
        data.message ||
          `"${data.campaign?.title || form.title}" 캠페인을 반영했습니다.`,
      );
      resetForm();
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  async function handleQueueSelectedHandoff() {
    if (!selectedCampaign) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/content/campaigns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "handoff",
          id: selectedCampaign.id,
          title: selectedCampaign.title,
          brandKey: selectedCampaign.brand,
          channel: selectedCampaign.channel,
          status: selectedCampaign.status,
          goal: selectedCampaign.goal,
          nextAction: selectedCampaign.nextAction,
          handoff: selectedCampaign.handoff,
          startDate: selectedCampaign.startDate,
          endDate: selectedCampaign.endDate,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Campaign handoff failed.");
      }

      if (data.campaign) {
        setCampaigns((current) => [
          data.campaign,
          ...current.filter((item) => item.id !== data.campaign.id),
        ]);
        setSelectedId(data.campaign.id);
      }

      if (data.run) {
        setRuns((current) => [data.run, ...current]);
      }

      setActivityNote(data.message || `"${selectedCampaign.title}" handoff 를 큐에 올렸습니다.`);
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="summary-grid" aria-label="Campaign summary">
        <SummaryCard
          title="라이브 캠페인"
          value={String(liveCount).padStart(2, "0")}
          detail="지금 움직이는 brief와 handoff 수."
          badge="Live"
          tone="green"
        />
        <SummaryCard
          title="대기 handoff"
          value={String(queuedCount).padStart(2, "0")}
          detail="Publish, Email, AI orders로 넘어갈 준비 상태."
          badge="Handoff"
          tone="warning"
        />
        <SummaryCard
          title="브랜드 범위"
          value={String(brandCount).padStart(2, "0")}
          detail="현재 campaign surface에 묶인 브랜드 수."
          badge="Scope"
          tone="blue"
        />
        <SummaryCard
          title="완료 루프"
          value={String(completedCount).padStart(2, "0")}
          detail="완료 후 기록으로 남겨 재활용 가능한 캠페인."
          badge="Closed"
          tone="muted"
        />
      </section>

      <div className="campaign-workspace">
        <aside className="campaign-rail" aria-label="Campaign board">
          <div className="campaign-rail-head">
            <div>
              <p className="section-kicker">Board</p>
              <h2 className="section-title" style={{ fontSize: "18px" }}>
                캠페인 레인
              </h2>
            </div>
            <button type="button" className="button button-ghost" onClick={resetForm} disabled={pending}>
              + 새 brief
            </button>
          </div>

          <ul className="campaign-board-list">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  className="campaign-board-button"
                  onClick={() => handleSelectCampaign(campaign)}
                >
                  <div
                    className="campaign-board-item"
                    data-active={campaign.id === selectedId ? "true" : "false"}
                  >
                    <div className="campaign-board-head">
                      <strong>{campaign.title}</strong>
                      <span className="legend-chip" data-tone={campaign.statusTone || "muted"}>
                        {campaign.status}
                      </span>
                    </div>
                    <p>{campaign.goal}</p>
                    <div className="campaign-board-meta">
                      <span>{campaign.brand ? getContentBrandLabel(campaign.brand) : "Shared lane"}</span>
                      <span>{campaign.window}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="campaign-rail-foot">
            <p className="muted tiny">
              브랜드가 선택돼 있으면 새 brief 의 기본 brand 도 그 값으로 맞춰집니다.
            </p>
          </div>
        </aside>

        <div className="campaign-pane">
          <SectionCard
            kicker="Editor"
            title={editingId ? "캠페인 수정" : "새 캠페인 brief 작성"}
            description="Campaign 는 콘텐츠, 발행, 이메일, AI handoff 가 같은 문맥으로 움직이게 하는 운영 객체입니다."
            action={
              <>
                <button type="button" className="button button-ghost" onClick={resetForm} disabled={pending}>
                  초기화
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void handleSubmit()}
                  disabled={pending}
                >
                  {pending ? "저장 중..." : editingId ? "업데이트" : "저장"}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void handleSubmit("handoff")}
                  disabled={pending || !form.title.trim()}
                >
                  handoff 큐잉
                </button>
              </>
            }
          >
            <div className="status-note" data-tone="blue">
              <strong>Activity</strong>
              <p>{activityNote}</p>
            </div>

            <div className="ai-order-form">
              <div className="ai-order-form-grid">
                <label className="ai-order-field">
                  <span>캠페인 이름</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder="예: 시나브로 리텐션 리프레시"
                  />
                </label>

                <label className="ai-order-field">
                  <span>브랜드</span>
                  <select
                    value={form.brandKey}
                    onChange={(event) => updateField("brandKey", event.target.value)}
                  >
                    {CONTENT_BRANDS.filter((item) => item.value !== "all").map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="ai-order-field">
                  <span>채널 묶음</span>
                  <input
                    type="text"
                    value={form.channel}
                    onChange={(event) => updateField("channel", event.target.value)}
                    placeholder="예: Email + Publish"
                  />
                </label>

                <label className="ai-order-field">
                  <span>상태</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateField("status", event.target.value)}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="ai-order-field">
                  <span>시작일</span>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => updateField("startDate", event.target.value)}
                  />
                </label>

                <label className="ai-order-field">
                  <span>종료일</span>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => updateField("endDate", event.target.value)}
                  />
                </label>

                <label className="ai-order-field ai-order-field-full">
                  <span>Goal</span>
                  <textarea
                    rows={3}
                    value={form.goal}
                    onChange={(event) => updateField("goal", event.target.value)}
                    placeholder="이 캠페인이 실제로 바꾸고 싶은 것"
                  />
                </label>

                <label className="ai-order-field ai-order-field-full">
                  <span>Next action</span>
                  <textarea
                    rows={3}
                    value={form.nextAction}
                    onChange={(event) => updateField("nextAction", event.target.value)}
                    placeholder="지금 바로 이어서 움직여야 할 다음 액션"
                  />
                </label>

                <label className="ai-order-field ai-order-field-full">
                  <span>Handoff flow</span>
                  <textarea
                    rows={2}
                    value={form.handoff}
                    onChange={(event) => updateField("handoff", event.target.value)}
                    placeholder="예: Studio -> Publish -> Email"
                  />
                </label>
              </div>
            </div>
          </SectionCard>

          {selectedCampaign ? (
            <SectionCard
              kicker="Selected"
              title={selectedCampaign.title}
              description={`${selectedCampaign.brandLabel} · ${selectedCampaign.channel}`}
              action={
                <>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => handleEditCampaign(selectedCampaign)}
                  >
                    Edit brief
                  </button>
                  <Link className="button button-secondary" href={buildEmailHref(selectedCampaign)}>
                    Email handoff
                  </Link>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void handleQueueSelectedHandoff()}
                    disabled={pending}
                  >
                    Queue handoff
                  </button>
                  <Link className="button button-primary" href={buildOrdersHref(selectedCampaign)}>
                    AI order draft
                  </Link>
                </>
              }
            >
              <div className="project-grid">
                <article className="project-card">
                  <div className="project-head">
                    <div>
                      <h3>Status</h3>
                      <p>{selectedCampaign.window}</p>
                    </div>
                    <span className="legend-chip" data-tone={selectedCampaign.statusTone || "muted"}>
                      {selectedCampaign.status}
                    </span>
                  </div>
                  <p className="check-detail">{selectedCampaign.goal}</p>
                  <p className="check-detail">
                    <strong>Next</strong> · {selectedCampaign.nextAction}
                  </p>
                  <p className="check-detail">
                    <strong>Handoff</strong> · {selectedCampaign.handoff}
                  </p>
                </article>

                <article className="project-card">
                  <div className="project-head">
                    <div>
                      <h3>Coverage</h3>
                      <p>관련 콘텐츠와 출력물 묶음</p>
                    </div>
                    <span className="legend-chip" data-tone="blue">
                      {selectedCampaign.contentCount + selectedCampaign.variantCount + selectedCampaign.publishCount}
                    </span>
                  </div>
                  <div className="detail-stack">
                    <div>
                      <dt>Content</dt>
                      <dd>{selectedCampaign.contentCount}</dd>
                    </div>
                    <div>
                      <dt>Variants</dt>
                      <dd>{selectedCampaign.variantCount}</dd>
                    </div>
                    <div>
                      <dt>Publish</dt>
                      <dd>{selectedCampaign.publishCount}</dd>
                    </div>
                  </div>
                </article>

                <article className="project-card">
                  <div className="project-head">
                    <div>
                      <h3>Email handoff</h3>
                      <p>{selectedCampaign.emailHandoff.segmentLabel}</p>
                    </div>
                    <span className="legend-chip" data-tone="green">
                      {selectedCampaign.emailHandoff.templateName}
                    </span>
                  </div>
                  <p className="check-detail">
                    <strong>Subject</strong> · {selectedCampaign.emailHandoff.subject}
                  </p>
                  <p className="check-detail">
                    <strong>Audience</strong> · {selectedCampaign.emailHandoff.audience}
                  </p>
                </article>
              </div>

              <div className="split-grid">
                <SectionCard
                  kicker="Related content"
                  title="이 캠페인에 붙어 있는 콘텐츠"
                  description="캠페인과 같은 브랜드 문맥으로 묶인 큐/출력물입니다."
                >
                  <div className="template-grid">
                    {selectedCampaign.relatedContent.length ? (
                      selectedCampaign.relatedContent.map((item) => (
                        <div className="template-row" key={`${selectedCampaign.id}-${item.title}`}>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </div>
                          <span className="legend-chip" data-tone="muted">
                            {item.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="check-detail">아직 연결된 콘텐츠가 없습니다.</p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  kicker="Handoff log"
                  title="최근 run / handoff"
                  description="Queue 된 handoff 와 최근 결과를 같은 카드 안에서 추적합니다."
                >
                  <div className="timeline">
                    {selectedRuns.length ? (
                      selectedRuns.map((item) => (
                        <div className="timeline-item" key={item.id}>
                          <div className="inline-legend">
                            <span className="legend-chip" data-tone={item.tone}>
                              {item.status}
                            </span>
                            <span className="muted tiny">{item.time}</span>
                          </div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                          <p className="check-detail">
                            <strong>Flow</strong> · {item.handoff}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="check-detail">아직 기록된 run 이 없습니다.</p>
                    )}
                  </div>
                </SectionCard>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              kicker="Selected"
              title="캠페인을 하나 선택하세요"
              description="왼쪽 레인에서 기존 brief 를 고르거나, 위 폼으로 새 캠페인을 만들어 바로 handoff 를 붙일 수 있습니다."
            >
              <p className="check-detail">
                브랜드가 아직 좁혀지지 않았더라도 campaign 객체는 먼저 만들고, 이후 Content / Publish / Email / AI Orders로 이어갈 수 있습니다.
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
