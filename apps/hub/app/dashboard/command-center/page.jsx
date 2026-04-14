import Link from "next/link";
import { RecentRoutesPanel } from "@/components/dashboard/recent-routes-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { commandCenterQueue, navigationItems, quickCommands } from "@/lib/dashboard-data";

const QUICK_JUMP_CARDS = [
  {
    title: "아침 브리프",
    label: "시작",
    tone: "green",
    detail: "하루 첫 판단을 짧게 끝내고 바로 일로 들어갑니다.",
    href: "/dashboard/daily-brief",
  },
  {
    title: "Work OS",
    label: "집중",
    tone: "blue",
    detail: "프로젝트, PMS, 일정, 릴리즈까지 한 번에 확인합니다.",
    href: "/dashboard/work",
  },
  {
    title: "이메일 레인",
    label: "발신",
    tone: "warning",
    detail: "메일 작성, dry-run, 발송 대기열까지 바로 이어집니다.",
    href: "/dashboard/automations/email",
  },
  {
    title: "AI 콘솔",
    label: "보조",
    tone: "muted",
    detail: "Claude와 Codex에게 바로 작업을 던질 수 있습니다.",
    href: "/dashboard/ai",
  },
  {
    title: "OpenClaw 레인",
    label: "파트너",
    tone: "blue",
    detail: "OpenClaw 본 레인과 alias 경로까지 함께 점검합니다.",
    href: "/dashboard/automations/integrations",
  },
  {
    title: "OpenClaw 별칭",
    label: "파트너",
    tone: "warning",
    detail: "Moltbot 경로는 OpenClaw alias로 빠르게 smoke test 합니다.",
    href: "/dashboard/automations/webhooks",
  },
];

const COMMAND_DESTINATIONS = {
  "/cardnews retention campaign": {
    href: "/dashboard/content/studio",
    cta: "스튜디오 열기",
  },
  "/projects": {
    href: "/dashboard/work/projects",
    cta: "프로젝트 열기",
  },
  "/pms weekly": {
    href: "/dashboard/work/pms",
    cta: "PMS 열기",
  },
  "/webhooks": {
    href: "/dashboard/automations/webhooks",
    cta: "웹훅 점검",
  },
};

const QUEUE_DESTINATIONS = [
  "/dashboard/work/projects",
  "/dashboard/work/pms",
  "/dashboard/automations/webhooks",
];

export default function CommandCenterPage() {
  const utilitySurfaces = navigationItems
    .filter((item) => item.group === "utility" && item.href !== "/dashboard/command-center")
    .map((item) => ({
      href: item.href,
      title: item.label,
      detail: item.description,
    }));

  return (
    <div className="app-page">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">커맨드 센터</p>
            <h1>원하는 화면으로 바로 가는 진입점</h1>
            <p className="hero-lede">
              헤매지 않고 바로 열고, 바로 실행하고, 바로 복귀하는 곳입니다. 이제
              이 화면은 더 이상 리다이렉트 루프가 아니라 실제 작업 진입판입니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/daily-brief">
                브리프 열기
              </Link>
              <Link className="button button-secondary" href="/dashboard/work">
                워크 OS 열기
              </Link>
              <Link className="button button-ghost" href="/dashboard/automations/email">
                이메일 레인 열기
              </Link>
            </div>
          </div>

          <div className="hero-panel">
            <p className="section-kicker">빠른 습관</p>
            <h2>Cmd/Ctrl + K</h2>
            <p>
              허브 어느 화면에서든 빠른 점프 팔레트를 열 수 있습니다. 최근 방문
              화면이 위로 올라오니, 자주 쓰는 동선은 더 빨라집니다.
            </p>
            <div className="hero-chip-row">
              <span className="chip">빠른 점프</span>
              <span className="chip">최근 화면</span>
              <span className="chip">낮은 마찰</span>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="커맨드 센터 요약 지표">
        <SummaryCard
          title="빠른 점프"
          value={String(QUICK_JUMP_CARDS.length)}
          detail="가장 자주 쓰는 핵심 작업 진입점."
          badge="경로"
          tone="green"
        />
        <SummaryCard
          title="슬래시 명령"
          value={String(quickCommands.length)}
          detail="엔진에 던질 수 있는 대표 실행 명령."
          badge="디스패치"
          tone="blue"
        />
        <SummaryCard
          title="큐 항목"
          value={String(commandCenterQueue.length)}
          detail="지금 움직이면 좋은 다음 액션들."
          badge="다음"
          tone="warning"
        />
        <SummaryCard
          title="유틸리티 화면"
          value={String(utilitySurfaces.length)}
          detail="일상적으로 오가는 제어 화면들."
          badge="유틸리티"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="빠른 레인"
          title="지금 바로 여는 화면"
          description="아침 브리프, 워크 OS, 이메일, AI 콘솔처럼 바로 손이 가야 하는 화면들만 모았습니다."
        >
          <div className="project-grid">
            {QUICK_JUMP_CARDS.map((item) => (
              <article className="project-card" key={item.href}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.label}</p>
                  </div>
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.label}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
                <div className="hero-actions">
                  <Link className="button button-secondary" href={item.href}>
                    열기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="슬래시"
          title="대표 실행 명령"
          description="엔진 쪽 기능을 생각할 때마다 문서를 뒤지지 않게, 자주 쓰는 명령을 한곳에 모았습니다."
        >
          <div className="template-grid">
            {quickCommands.map((item) => {
              const destination = COMMAND_DESTINATIONS[item.command];

              return (
                <div className="template-row" key={item.command}>
                  <div>
                    <strong>
                      <code>{item.command}</code>
                    </strong>
                    <p>{item.note}</p>
                  </div>
                  {destination ? (
                    <Link className="button button-secondary" href={destination.href}>
                      {destination.cta}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="큐"
          title="다음으로 밀어야 할 액션"
          description="생각만 하고 미뤄지기 쉬운 항목을 바로 열 수 있게 연결했습니다."
        >
          <div className="timeline">
            {commandCenterQueue.map((item, index) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    다음
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <div className="hero-actions">
                  <Link
                    className="button button-ghost"
                    href={QUEUE_DESTINATIONS[index] || "/dashboard"}
                  >
                    레인 열기
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="최근"
          title="방금 오간 화면 다시 열기"
          description="방금 방문했던 화면을 다시 찾느라 사이드바를 훑지 않게, 최근 동선을 카드로 바로 꺼냈습니다."
        >
          <RecentRoutesPanel />
        </SectionCard>

        <SectionCard
          kicker="유틸리티"
          title="자주 오가는 제어 화면"
          description="설정, 플레이북, AI 콘솔처럼 맥락 전환이 잦은 화면도 여기서 바로 열 수 있습니다."
        >
          <div className="template-grid">
            {utilitySurfaces.map((item) => (
              <div className="template-row" key={item.href}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button-secondary" href={item.href}>
                  열기
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
