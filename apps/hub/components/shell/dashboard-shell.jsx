"use client";

import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  getActiveNavigationSection,
  getActiveNavigationView,
  matchesNavigationPath,
  navigationItems,
  shellActions,
} from "@/lib/dashboard-data";
import { LanguageSwitcher } from "./language-switcher";

const BUTTON_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
};

const SECTION_CONTEXT_QUERY_KEYS = {
  "/dashboard/work": ["project"],
  "/dashboard/content": ["brand"],
};

const HUB_COPY = {
  overview: { label: "개요", description: "오늘의 신호와 운영 펄스" },
  work: { label: "업무 OS", description: "프로젝트, 일정, 의사결정 흐름" },
  workOverview: { label: "업무 개요", description: "포커스 스택과 실행 흐름" },
  workProjects: { label: "프로젝트", description: "포트폴리오, 블로커, 마일스톤" },
  workManagement: { label: "관리", description: "진행, 태스크, GitHub 신호" },
  workCalendar: { label: "캘린더", description: "공유 일정과 마감 타이밍" },
  workRhythm: { label: "리듬", description: "반복 점검과 케이던스 루프" },
  workPms: { label: "PMS", description: "배포 펄스와 운영 케이던스" },
  workRoadmap: { label: "로드맵", description: "마일스톤과 릴리스 레인" },
  "/dashboard/work/plan": { label: "계획 비교", description: "계획과 현재의 차이를 한눈에" },
  workDecisions: { label: "의사결정", description: "결정, 리뷰 노트, 후속 이행" },
  workReleases: { label: "릴리스", description: "패치 노트와 주간 배송 로그" },
  revenue: { label: "수익", description: "리드, 거래, 계정, 케이스" },
  revenueOverview: { label: "수익 개요", description: "파이프라인 건강도와 다음 움직임" },
  revenueLeads: { label: "리드", description: "웜 인바운드와 팔로업 큐" },
  revenueDeals: { label: "딜", description: "거래 단계와 클로즈 리스크" },
  revenueAccounts: { label: "계정", description: "고객 상태와 계정 건강도" },
  revenueCases: { label: "케이스", description: "고객 작업과 에스컬레이션" },
  content: { label: "콘텐츠", description: "큐, 스튜디오, 에셋, 발행" },
  contentOverview: { label: "콘텐츠 개요", description: "파이프라인 건강도와 발행 케이던스" },
  contentQueue: { label: "큐", description: "아이디어, 브리프, 검토 상태" },
  contentStudio: { label: "스튜디오", description: "카드뉴스 초안 워크스페이스" },
  contentCampaigns: { label: "캠페인", description: "브리프, 핸드오프, 후속 경로" },
  contentAssets: { label: "에셋", description: "결과물, 파일, 원본 자료" },
  contentPublish: { label: "발행", description: "배포 이력과 채널 상태" },
  automations: { label: "자동화", description: "실행, 웹훅, 에이전트, 싱크" },
  automationsOverview: { label: "자동화 개요", description: "머신 상태와 최근 출력" },
  automationsRuns: { label: "실행", description: "실행 펄스와 실패" },
  automationsWebhooks: { label: "웹훅", description: "엔드포인트와 수신 이력" },
  automationsIntegrations: { label: "연동", description: "연결된 시스템과 싱크 실행" },
  automationsEmail: { label: "이메일", description: "템플릿, 큐, 발송" },
  evolution: { label: "진화", description: "로그, 이슈, 메모, 활동" },
  evolutionOverview: { label: "진화 개요", description: "자가 개선 루프와 오너십" },
  evolutionLogs: { label: "로그", description: "에러, 경고, 수정 상태" },
  evolutionIssues: { label: "이슈", description: "운영 리스크와 완화 상태" },
  evolutionActivity: { label: "활동", description: "최근 변경사항" },
  dailyBrief: { label: "데일리 브리프", description: "아침 브리프와 다음 세 액션" },
  playbooks: { label: "플레이북", description: "반복 SOP와 핸드오프 레시피" },
  command: { label: "명령 팔레트", description: "검색, 라우팅, 디스패치" },
  ai: { label: "AI 콘솔", description: "챗, 카운슬, 직접 오더" },
  aiOverview: { label: "AI 개요", description: "에이전트 상태와 오픈 오더" },
  aiOffice: { label: "상황실", description: "에이전트, 오더, 활동을 한 장면으로 읽는 운영 보드" },
  aiChat: { label: "챗", description: "Claude와 Codex를 잇는 대화 레일" },
  aiCouncil: { label: "카운슬", description: "검토, 토론, 수렴" },
  aiOrders: { label: "오더", description: "직접 지시와 실행 추적" },
  settings: { label: "설정", description: "환경, 매핑, 안전장치" },
};

const HUB_ACTION_LABELS = {
  openBrief: "브리프 열기",
  openWork: "업무 OS 열기",
  openStudio: "스튜디오 열기",
  openCommand: "명령 팔레트",
  openAiConsole: "AI 콘솔",
};

function getNavCopy(item) {
  const key = item?.i18nKey || item?.href || "";
  return HUB_COPY[key] || {
    label: item?.label || "섹션",
    description: item?.description || "",
  };
}

function isOverviewNavigationView(item) {
  const key = item?.i18nKey || "";
  return key === "overview" || key.endsWith("Overview");
}

export function DashboardShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefetchedRoutesRef = useRef(new Set());

  const currentSection = getActiveNavigationSection(pathname);
  const currentView = getActiveNavigationView(pathname, currentSection);
  const sectionCopy = getNavCopy(currentSection);
  const viewCopy = getNavCopy(currentView);
  const compactView = pathname !== "/dashboard";

  const coreLanes = navigationItems.filter((item) => (item.group || "core") === "core");
  const utilityLanes = navigationItems.filter((item) => item.group === "utility");
  const sectionViews = currentSection.children?.length ? currentSection.children : [];
  const currentRoute = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const sectionContextQuery = useMemo(() => {
    const params = new URLSearchParams();
    const keys = SECTION_CONTEXT_QUERY_KEYS[currentSection?.href] || [];

    keys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        params.set(key, value);
      }
    });

    return params.toString();
  }, [currentSection?.href, searchParams]);

  const buildSectionViewHref = useCallback(
    (href) => {
      if (!sectionContextQuery) {
        return href;
      }

      return `${href}?${sectionContextQuery}`;
    },
    [sectionContextQuery],
  );

  const warmRoute = useCallback(
    (href) => {
      if (!href || href === currentRoute || prefetchedRoutesRef.current.has(href)) {
        return;
      }

      try {
        prefetchedRoutesRef.current.add(href);
        router.prefetch(href);
      } catch {
        prefetchedRoutesRef.current.delete(href);
      }
    },
    [currentRoute, router],
  );

  return (
    <div className="hub-shell" data-view-mode={compactView ? "compact" : "overview"}>
      <aside className="hub-shell__nav" aria-label="주 내비게이션">
        <Link className="hub-shell__brand" href="/dashboard" aria-label="moonlight 프로젝트 홈">
          <span className="hub-shell__brand-mark" aria-hidden="true">
            ◐
          </span>
          <span className="hub-shell__brand-text">
            <strong>moonlight 프로젝트</strong>
            <span>프라이빗 운영 쉘</span>
          </span>
        </Link>

        <nav className="hub-shell__nav-group" aria-label="핵심 레인">
          <p className="hub-shell__nav-kicker">핵심 레인</p>
          <ul className="hub-shell__nav-list">
            {coreLanes.map((item) => {
              const active = matchesNavigationPath(pathname, item.href);
              const copy = getNavCopy(item);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hub-shell__nav-link"
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "page" : undefined}
                    onMouseEnter={() => warmRoute(item.href)}
                    onFocus={() => warmRoute(item.href)}
                  >
                    <span className="hub-shell__nav-link-label">{copy.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {utilityLanes.length ? (
          <nav className="hub-shell__nav-group" aria-label="유틸리티 탭">
            <p className="hub-shell__nav-kicker">유틸리티 탭</p>
            <ul className="hub-shell__nav-list">
              {utilityLanes.map((item) => {
                const active = matchesNavigationPath(pathname, item.href);
                const copy = getNavCopy(item);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="hub-shell__nav-link"
                      data-active={active ? "true" : undefined}
                      aria-current={active ? "page" : undefined}
                      onMouseEnter={() => warmRoute(item.href)}
                      onFocus={() => warmRoute(item.href)}
                    >
                      <span className="hub-shell__nav-link-label">{copy.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </aside>

      <div className="hub-shell__main">
        <header className="hub-shell__topbar">
          <div className="hub-shell__topbar-crumb">
            <p className="hub-shell__topbar-kicker">moonlight 프로젝트</p>
            <h1 className="hub-shell__topbar-title">
              {sectionCopy.label}
              {currentView.href !== currentSection.href ? (
                <span className="hub-shell__topbar-title-tail">· {viewCopy.label}</span>
              ) : null}
            </h1>
          </div>
          <div className="hub-shell__topbar-actions">
            <LanguageSwitcher />
            {shellActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="hub-shell__topbar-action-link cm-btn"
                data-variant={BUTTON_VARIANT[action.tone] || "secondary"}
                data-surface="dark"
                onMouseEnter={() => warmRoute(action.href)}
                onFocus={() => warmRoute(action.href)}
              >
                {HUB_ACTION_LABELS[action.i18nKey] || action.label}
              </Link>
            ))}
          </div>
        </header>

        {sectionViews.length > 1 ? (
          <nav className="hub-shell__subnav" aria-label={`${sectionCopy.label} 보조 뷰`}>
            {sectionViews.map((view) => {
              const active = matchesNavigationPath(pathname, view.href);
              const copy = getNavCopy(view);
              const href = buildSectionViewHref(view.href);

              return (
                <Link
                  key={href}
                  href={href}
                  className="hub-shell__subnav-link"
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => warmRoute(href)}
                  onFocus={() => warmRoute(href)}
                >
                  {copy.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <main className="hub-shell__content">{children}</main>
      </div>
    </div>
  );
}
