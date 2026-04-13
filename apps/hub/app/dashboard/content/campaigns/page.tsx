"use client"

import { useState } from "react"
import { StatusBadge, SlidePanel, toast } from "@com-moon/ui"

// ─── Types ───────────────────────────────────────────────────────────────────

type CampaignStatus = "draft" | "scheduled" | "active" | "completed"

type Campaign = {
  id: string
  name: string
  description: string
  status: CampaignStatus
  content_count: number
  scheduled_at: string | null
  created_at: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_CAMPAIGNS: Campaign[] = [
  { id: "1", name: "4월 봄 시즌 콘텐츠", description: "봄 시즌 맞춤 카드뉴스 시리즈", status: "active", content_count: 5, scheduled_at: null, created_at: "2026-04-01" },
  { id: "2", name: "신제품 론칭 캠페인", description: "신규 서비스 소개 콘텐츠 패키지", status: "scheduled", content_count: 3, scheduled_at: "2026-04-20", created_at: "2026-03-28" },
  { id: "3", name: "브랜드 스토리", description: "브랜드 철학과 팀 소개 시리즈", status: "draft", content_count: 2, scheduled_at: null, created_at: "2026-03-20" },
  { id: "4", name: "1분기 리뷰", description: "Q1 성과 및 하이라이트 정리", status: "completed", content_count: 4, scheduled_at: null, created_at: "2026-03-01" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatScheduledDate(dateStr: string): string {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${mm}/${dd}`
}

function formatCreatedDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

// ─── CampaignCard ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm p-5 hover:border-[rgba(0,0,0,0.12)] hover:shadow-md transition-all duration-200 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#0F0F0F] truncate">{campaign.name}</span>
        <StatusBadge status={campaign.status} dot />
      </div>

      {/* Description */}
      <p className="text-sm text-[#9BA8B5] leading-relaxed">{campaign.description}</p>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F8F8F9] border border-[rgba(0,0,0,0.07)] text-xs text-[#4B5563]">
          📄 {campaign.content_count}개 콘텐츠
        </span>
        {campaign.scheduled_at && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[rgba(0,0,0,0.07)] text-xs text-[#D97706]">
            📅 {formatScheduledDate(campaign.scheduled_at)} 예약
          </span>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-xs text-[#C4C9CF]">{formatCreatedDate(campaign.created_at)} 생성</span>
        <button className="text-xs text-[#9BA8B5] hover:text-[#0F0F0F] transition-colors duration-150">
          콘텐츠 관리 →
        </button>
      </div>
    </div>
  )
}

// ─── KPI Filter Pills ─────────────────────────────────────────────────────────

type FilterKey = "all" | CampaignStatus

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "active", label: "활성" },
  { key: "scheduled", label: "예약됨" },
  { key: "completed", label: "완료" },
  { key: "draft", label: "초안" },
]

function KpiBar({
  campaigns,
  activeFilter,
  onFilter,
}: {
  campaigns: Campaign[]
  activeFilter: FilterKey
  onFilter: (key: FilterKey) => void
}) {
  const counts: Record<string, number> = {
    all: campaigns.length,
    active: campaigns.filter((c) => c.status === "active").length,
    scheduled: campaigns.filter((c) => c.status === "scheduled").length,
    completed: campaigns.filter((c) => c.status === "completed").length,
    draft: campaigns.filter((c) => c.status === "draft").length,
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {FILTER_LABELS.map(({ key, label }) => {
        const active = activeFilter === key
        return (
          <button
            key={key}
            onClick={() => onFilter(key)}
            className={[
              "px-3 py-1.5 text-sm rounded-lg transition-all duration-100",
              active
                ? "bg-[#0F0F0F] text-white font-medium shadow-sm"
                : "text-[#6B7280] hover:bg-[#F8F8F9] hover:text-[#0F0F0F] border border-[rgba(0,0,0,0.07)]",
            ].join(" ")}
          >
            {label} {counts[key]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Create Campaign Form ─────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150"

type FormStatus = "draft" | "scheduled" | "active"

function CreateCampaignForm({
  onSubmit,
}: {
  onSubmit: (campaign: Campaign) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<FormStatus>("draft")
  const [scheduledAt, setScheduledAt] = useState("")
  const [errors, setErrors] = useState<{ name?: string }>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: { name?: string } = {}
    if (!name.trim()) errs.name = "캠페인명을 입력해주세요"
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    const newCampaign: Campaign = {
      id: String(Date.now()),
      name: name.trim(),
      description: description.trim(),
      status,
      content_count: 0,
      scheduled_at: status === "scheduled" && scheduledAt ? scheduledAt : null,
      created_at: new Date().toISOString().slice(0, 10),
    }

    onSubmit(newCampaign)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
      {/* 캠페인명 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#374151]">
          캠페인명 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (errors.name) setErrors({})
          }}
          placeholder="예: 5월 콘텐츠 시리즈"
          className={INPUT_CLASS}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* 설명 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#374151]">설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="캠페인에 대한 간단한 설명을 입력하세요"
          rows={3}
          className={INPUT_CLASS + " resize-none"}
        />
      </div>

      {/* 상태 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#374151]">상태</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FormStatus)}
          className={INPUT_CLASS}
        >
          <option value="draft">초안</option>
          <option value="scheduled">예약됨</option>
          <option value="active">활성</option>
        </select>
      </div>

      {/* 예약 발행일 — status=scheduled일 때만 */}
      {status === "scheduled" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#374151]">예약 발행일</label>
          <input
            type="date"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        className="mt-2 w-full px-4 py-2.5 bg-[#0F0F0F] text-white text-sm font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors duration-150"
      >
        캠페인 만들기
      </button>
    </form>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [panelOpen, setPanelOpen] = useState(false)

  const filtered =
    activeFilter === "all"
      ? campaigns
      : campaigns.filter((c) => c.status === activeFilter)

  function addCampaign(campaign: Campaign) {
    setCampaigns((prev) => [campaign, ...prev])
    toast.success(`"${campaign.name}" 캠페인이 생성됐습니다`)
    setPanelOpen(false)
  }

  return { campaigns, filtered, activeFilter, setActiveFilter, panelOpen, setPanelOpen, addCampaign }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const {
    campaigns,
    filtered,
    activeFilter,
    setActiveFilter,
    panelOpen,
    setPanelOpen,
    addCampaign,
  } = useCampaigns()

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0F0F0F]">캠페인</h1>
          <p className="text-sm text-[#9BA8B5] mt-0.5">콘텐츠 시리즈 · 예약 발행 관리</p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="shrink-0 px-4 py-2 bg-[#0F0F0F] text-white text-sm font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors duration-150 shadow-sm"
        >
          캠페인 만들기
        </button>
      </div>

      {/* KPI summary bar */}
      <div className="mb-5">
        <KpiBar campaigns={campaigns} activeFilter={activeFilter} onFilter={setActiveFilter} />
      </div>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-[#9BA8B5]">해당 상태의 캠페인이 없습니다.</p>
          <button
            onClick={() => setPanelOpen(true)}
            className="mt-4 text-sm text-[#0F0F0F] underline underline-offset-2"
          >
            새 캠페인 만들기
          </button>
        </div>
      )}

      {/* SlidePanel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="캠페인 만들기"
        description="새 캠페인을 생성하고 콘텐츠를 묶어서 관리하세요."
      >
        <CreateCampaignForm onSubmit={addCampaign} />
      </SlidePanel>
    </div>
  )
}
