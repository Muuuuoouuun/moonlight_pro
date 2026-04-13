"use client";

import { useState } from "react";
import { toast } from "@com-moon/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface Integration {
  key: string;
  label: string;
  desc: string;
  connected: boolean;
  note: string | null;
  disabled?: boolean;
}

interface NotificationPref {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
}

// ── Toggle Switch ──────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={disabled ? undefined : onChange}
      className={[
        "w-10 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0",
        checked ? "bg-[#0F0F0F]" : "bg-[#E5E7EB]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
          checked ? "left-[calc(100%-1.125rem)]" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ── Section Label ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#9BA8B5] uppercase tracking-[0.12em] mb-4 select-none">
      {children}
    </p>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────

const inputClass =
  "w-full px-3.5 py-2.5 text-sm border border-[rgba(0,0,0,0.09)] rounded-xl bg-[#FAFAFA] text-[#0F0F0F] placeholder:text-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#0F0F0F]/20 focus:border-[#0F0F0F] transition-all duration-150";

// ── Profile Section ────────────────────────────────────────────────────────

function ProfileSection() {
  const [name, setName] = useState("Moon");
  const [role, setRole] = useState("개인 운영자");

  function handleSave() {
    toast.success("프로필이 저장됐습니다");
  }

  return (
    <div className="mb-10">
      <SectionLabel>프로필</SectionLabel>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-start gap-5">
          {/* Avatar */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-[#0F0F0F] flex items-center justify-center">
              <span className="text-white text-lg font-semibold select-none">문</span>
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#9BA8B5] mb-1.5 select-none">
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#9BA8B5] mb-1.5 select-none">
                역할
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium bg-[#0F0F0F] text-white rounded-xl hover:bg-[#2a2a2a] transition-colors duration-150"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Integrations Section ───────────────────────────────────────────────────

function IntegrationsSection() {
  const [items, setItems] = useState<Integration[]>([
    {
      key: "telegram",
      label: "Telegram 봇",
      desc: "웹훅 수신 · 알림 전송",
      connected: true,
      note: "@com_moon_bot",
    },
    {
      key: "n8n",
      label: "n8n 자동화",
      desc: "워크플로 트리거 · 오케스트레이션",
      connected: false,
      note: null,
    },
    {
      key: "supabase",
      label: "Supabase",
      desc: "DB · Auth · 실시간",
      connected: true,
      note: "your-project.supabase.co",
    },
    {
      key: "openai",
      label: "OpenAI",
      desc: "콘텐츠 AI 어시스트 (준비중)",
      connected: false,
      note: null,
      disabled: true,
    },
  ]);

  function toggle(key: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const next = !item.connected;
        if (next) {
          toast.success(`${item.label} 연결됐습니다`);
        } else {
          toast.info(`${item.label} 연결이 해제됐습니다`);
        }
        return { ...item, connected: next };
      })
    );
  }

  return (
    <div className="mb-10">
      <SectionLabel>인테그레이션</SectionLabel>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">
        <div className="px-5">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-4 py-4 border-b border-[rgba(0,0,0,0.05)] last:border-0"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-[#F8F8F9] border border-[rgba(0,0,0,0.07)] flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-[#0F0F0F] select-none">
                  {item.label.charAt(0)}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F0F0F] leading-tight">{item.label}</p>
                <p className="text-xs text-[#9BA8B5] leading-tight mt-0.5">{item.desc}</p>
                {item.connected && item.note && (
                  <p className="text-xs font-mono text-[#C4C9CF] mt-0.5">{item.note}</p>
                )}
              </div>

              {/* Toggle */}
              <ToggleSwitch
                checked={item.connected}
                onChange={() => toggle(item.key)}
                disabled={item.disabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Notification Preferences Section ──────────────────────────────────────

function NotificationSection() {
  const [prefs, setPrefs] = useState<NotificationPref[]>([
    {
      key: "lead_notify",
      label: "신규 리드 알림",
      desc: "새 리드가 추가되면 알림",
      enabled: true,
    },
    {
      key: "content_notify",
      label: "콘텐츠 발행 알림",
      desc: "콘텐츠가 발행되면 알림",
      enabled: true,
    },
    {
      key: "ops_notify",
      label: "운영 건 상태 변경",
      desc: "운영 건 상태가 바뀌면 알림",
      enabled: false,
    },
    {
      key: "daily_report",
      label: "일일 요약 리포트",
      desc: "매일 오전 9시 KPI 요약",
      enabled: false,
    },
  ]);

  function toggle(key: string) {
    setPrefs((prev) =>
      prev.map((pref) => {
        if (pref.key !== key) return pref;
        toast.info("설정이 저장됐습니다");
        return { ...pref, enabled: !pref.enabled };
      })
    );
  }

  return (
    <div className="mb-10">
      <SectionLabel>알림 설정</SectionLabel>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.07)] shadow-sm overflow-hidden">
        <div className="px-5">
          {prefs.map((pref) => (
            <div
              key={pref.key}
              className="flex items-center gap-4 py-4 border-b border-[rgba(0,0,0,0.05)] last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F0F0F] leading-tight">{pref.label}</p>
                <p className="text-xs text-[#9BA8B5] leading-tight mt-0.5">{pref.desc}</p>
              </div>
              <ToggleSwitch
                checked={pref.enabled}
                onChange={() => toggle(pref.key)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Danger Zone Section ────────────────────────────────────────────────────

function DangerZoneSection() {
  return (
    <div className="mb-10">
      <SectionLabel>위험 구역</SectionLabel>
      <div className="border border-[rgba(220,38,38,0.15)] rounded-2xl p-5 bg-white shadow-sm">
        <p className="text-sm font-semibold text-[#DC2626] mb-4 select-none">위험 구역</p>

        {/* Reset row */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-[rgba(0,0,0,0.05)]">
          <div>
            <p className="text-sm font-medium text-[#0F0F0F]">모든 데이터 초기화</p>
            <p className="text-xs text-[#9BA8B5] mt-0.5">되돌릴 수 없습니다</p>
          </div>
          <button
            type="button"
            disabled
            className="px-4 py-2 text-sm font-medium border border-[rgba(220,38,38,0.3)] text-[#DC2626] rounded-xl opacity-40 cursor-not-allowed select-none"
          >
            초기화
          </button>
        </div>

        {/* Logout row */}
        <div className="flex items-center justify-between gap-4 pt-3">
          <div>
            <p className="text-sm font-medium text-[#0F0F0F]">로그아웃</p>
            <p className="text-xs text-[#9BA8B5] mt-0.5">현재 세션을 종료합니다</p>
          </div>
          <button
            type="button"
            onClick={() => toast.info("로그아웃은 준비중입니다")}
            className="px-4 py-2 text-sm font-medium text-[#9BA8B5] hover:text-[#0F0F0F] rounded-xl transition-colors duration-150 border border-[rgba(0,0,0,0.07)] hover:border-[rgba(0,0,0,0.12)]"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#0F0F0F] leading-tight">설정</h1>
        <p className="text-sm text-[#9BA8B5] mt-1">프로필 · 인테그레이션 · 환경설정</p>
      </div>

      <ProfileSection />
      <IntegrationsSection />
      <NotificationSection />
      <DangerZoneSection />
    </div>
  );
}
