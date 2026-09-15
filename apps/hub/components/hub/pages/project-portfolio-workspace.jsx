"use client";

import React from "react";
import { Badge, Button, Checkbox, Input } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import deliveryStyles from "./project-delivery.module.css";
import { ProjectDeliverySummary } from "./project-delivery";
import { BrandMark } from "./project-pms-components";
import { classifyProjectPortfolio, portfolioWindow } from "./project-pms-metrics";

const METRIC_FILTERS = [
  { key: "active", label: "진행" },
  { key: "blockedOrOverdue", label: "위험" },
  { key: "dueSoon", label: "7일 내" },
  { key: "unmeasured", label: "미측정" },
];

const STATUS_ORDER = ["doing", "todo", "inbox", "blocked", "done"];
const STATUS_COPY = {
  doing: "진행",
  todo: "대기",
  inbox: "수집",
  blocked: "막힘",
  done: "완료",
};

function progressValue(project) {
  if (!Number.isFinite(project?.displayProgress?.value) || project?.displayProgress?.partial) return null;
  return Math.max(0, Math.min(100, Math.round(project.displayProgress.value)));
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLongDate(value) {
  const date = dateValue(value);
  if (!date) return "기한 없음";
  return `${new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date)} 마감`;
}

function formatScheduleDate(value) {
  const date = dateValue(value);
  if (!date) return "기한 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function daysUntil(value, now = new Date()) {
  const due = dateValue(value);
  if (!due) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function projectRisk(project, window) {
  const flags = classifyProjectPortfolio(project, window);
  if (!flags.blockedOrOverdue) return { risky: false, label: "위험 없음" };
  const status = String(project?.statusKey || project?.status || "").toLowerCase();
  if (status === "blocked") return { risky: true, label: "막힘" };
  return { risky: true, label: "기한 지남" };
}

function taskStatusCounts(tasks) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  tasks.forEach((task) => {
    const status = String(task.status || (task.done ? "done" : "todo")).toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  return STATUS_ORDER
    .map((status) => ({ status, count: counts.get(status) || 0 }))
    .filter((entry) => entry.count > 0);
}

function PortfolioMetric({ metric, count, active, lowerBound, onSelect }) {
  return (
    <button
      type="button"
      className="hub-project-portfolio-metric"
      data-active={active ? "true" : "false"}
      aria-pressed={active}
      onClick={() => onSelect(active ? null : metric.key)}
    >
      <span className="hub-project-portfolio-metric__value mono">
        {String(count).padStart(2, "0")}{lowerBound ? "+" : ""}
      </span>
      <span>{metric.label}</span>
    </button>
  );
}

function computeDDay(dueAt) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `D+${Math.abs(diff)} 지연`, tone: "danger" };
  if (diff === 0) return { text: "D-Day", tone: "moon" };
  if (diff <= 7) return { text: `D-${diff}`, tone: "moon" };
  return { text: `D-${diff}`, tone: "neutral" };
}

function ProjectIndexRow({ project, brand, selected, keyboardSelected, window, onSelect }) {
  const progress = progressValue(project);
  const risk = projectRisk(project, window);
  const dday = computeDDay(project.dueAt);
  return (
    <button
      type="button"
      className="hub-project-portfolio-index-row hub-row"
      data-selected={selected ? "true" : "false"}
      data-risk={risk.risky ? "true" : "false"}
      data-kb-row={project.id}
      style={keyboardSelected ? { outline: "1px solid var(--moon-300)", outlineOffset: -1 } : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(project.id)}
    >
      <span className="hub-project-portfolio-index-row__heading">
        <BrandMark brand={brand} size={19} active={selected} />
        <strong>{project.name}</strong>
        <span className="mono">{progress === null ? "—" : `${progress}%`}</span>
      </span>
      <span className="hub-project-portfolio-index-row__progress" aria-hidden="true">
        <span style={{ width: `${progress ?? 0}%` }} />
      </span>
      <span className="hub-project-portfolio-index-row__meta">
        <span><Iconed name="calendar" size={12} />{formatLongDate(project.dueAt)}</span>
        {dday && <span className={`hub-project-dday-badge hub-project-dday-badge--${dday.tone}`}>{dday.text}</span>}
        <span className={risk.risky ? "is-risk" : ""}>
          <Iconed name={risk.risky ? "flag" : "check"} size={12} />{risk.label}
        </span>
      </span>
    </button>
  );
}

function PortfolioAccordion({ id, icon, label, count, summary, open, onToggle, children }) {
  return (
    <section className="hub-project-portfolio-accordion" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="hub-project-portfolio-accordion__trigger hub-row"
        aria-expanded={open}
        aria-controls={`portfolio-panel-${id}`}
        onClick={onToggle}
      >
        <Iconed name="chevronD" size={14} />
        <Iconed name={icon} size={19} />
        <strong>{label}</strong>
        <span className="mono">{count}</span>
        <span className="hub-project-portfolio-accordion__summary">{summary}</span>
        <Iconed name="chevronR" size={15} />
      </button>
      {open && (
        <div id={`portfolio-panel-${id}`} className="hub-project-portfolio-accordion__panel">
          {children}
        </div>
      )}
    </section>
  );
}

export function ProjectPortfolioWorkspace({
  projects = [],
  portfolioProjects = [],
  terminalProjects = [],
  todosByProject,
  brandByKey,
  brands = [],
  selectedProjectId,
  openDetailId,
  keyboardSelectedId,
  sourceState,
  readError,
  failedSources = [],
  projectCorePartial,
  activeFilter,
  onFilterChange,
  query,
  onQueryChange,
  searchInputRef,
  onOpenProject,
  onCreateProject,
  onManageDelivery,
  onCreateContent,
  onCreateTodo,
  onEditTodo,
  onToggleTodo,
  pendingTodoIds,
  showTerminal,
  onToggleTerminal,
  onReopenProject,
  onReload,
  onSwitchView,
  updates = [],
  createSurface = null,
}) {
  const [focusProjectId, setFocusProjectId] = React.useState(null);
  const [showDeliveryPlan, setShowDeliveryPlan] = React.useState(false);
  const [showFilterPicker, setShowFilterPicker] = React.useState(false);
  const [openSections, setOpenSections] = React.useState({
    items: true,
    checklist: true,
    schedule: true,
  });
  const window = React.useMemo(() => portfolioWindow(), []);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const locallyFocused = projects.find((project) => project.id === focusProjectId);
  const project = selectedProject || locallyFocused || projects[0] || null;
  const projectTasks = project ? (todosByProject.get(project.id) || []) : [];
  const openTasks = projectTasks.filter((task) => !task.done);
  const doneTasks = projectTasks.filter((task) => task.done);
  const datedTasks = projectTasks
    .filter((task) => dateValue(task.dueAt))
    .slice()
    .sort((a, b) => dateValue(a.dueAt) - dateValue(b.dueAt));
  const nextTask = openTasks.slice().sort((a, b) => {
    const aDue = dateValue(a.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = dateValue(b.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDue - bDue;
  })[0] || null;
  const progress = progressValue(project);
  const risk = project ? projectRisk(project, window) : { risky: false, label: "위험 없음" };
  const dueDays = project ? daysUntil(project.dueAt) : null;
  const dday = project ? computeDDay(project.dueAt) : null;
  const brand = project
    ? (brandByKey.get(project.brand) || brands[0] || null)
    : null;
  const taskStatuses = taskStatusCounts(projectTasks);
  const totalTasks = projectTasks.length;
  const doneTasksCount = doneTasks.length;
  const doingTasksCount = projectTasks.filter((t) => (String(t.status || "").toLowerCase() === "doing" || t.status === "In progress")).length;
  const blockedTasksCount = projectTasks.filter((t) => (String(t.status || "").toLowerCase() === "blocked" || t.status === "Blocked")).length;
  const todoTasksCount = Math.max(0, totalTasks - doneTasksCount - doingTasksCount - blockedTasksCount);
  const metrics = React.useMemo(() => {
    const counts = { active: 0, blockedOrOverdue: 0, dueSoon: 0, unmeasured: 0 };
    portfolioProjects.forEach((item) => {
      const flags = classifyProjectPortfolio(item, window);
      Object.keys(counts).forEach((key) => { if (flags[key]) counts[key] += 1; });
    });
    return counts;
  }, [portfolioProjects, window]);

  const selectProject = (projectId) => {
    setFocusProjectId(projectId);
  };
  const toggleSection = (section) => setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  const nextAction = project?.displayNextAction || project?.projectNextAction || nextTask?.title || "다음 행동 미정";
  const nextActionDescription = project?.displaySummary
    || (nextTask ? `${formatScheduleDate(nextTask.dueAt)}까지 처리할 가장 가까운 할 일입니다.` : "상세에서 다음 행동과 실행 근거를 정리하세요.");
  const lowerBound = Boolean(projectCorePartial || sourceState === "partial");

  return (
    <div
      className="hub-project-portfolio-workspace"
      data-detail-open={openDetailId ? "true" : "false"}
      data-create-open={createSurface ? "true" : "false"}
    >
      <aside className="hub-project-portfolio-index" aria-label="프로젝트 인덱스">
        <div className="hub-project-portfolio-index__header">
          <div>
            <strong>프로젝트</strong>
            <span className="mono">{portfolioProjects.length}{projectCorePartial ? "+" : ""}</span>
          </div>
          <Input
            ref={searchInputRef}
            icon="search"
            placeholder="프로젝트 검색"
            value={query}
            onChange={onQueryChange}
          />
          <div className="hub-project-portfolio-index__filters" role="group" aria-label="프로젝트 필터">
            <button type="button" aria-pressed={!activeFilter} data-active={!activeFilter ? "true" : "false"} onClick={() => onFilterChange(null)}>전체</button>
            <button type="button" aria-pressed={activeFilter === "active"} data-active={activeFilter === "active" ? "true" : "false"} onClick={() => onFilterChange(activeFilter === "active" ? null : "active")}>진행</button>
            <button type="button" aria-pressed={activeFilter === "blockedOrOverdue"} data-active={activeFilter === "blockedOrOverdue" ? "true" : "false"} onClick={() => onFilterChange(activeFilter === "blockedOrOverdue" ? null : "blockedOrOverdue")}>위험</button>
          </div>
        </div>

        <div className="hub-project-portfolio-index__list scroll-y">
          {projects.length === 0 ? (
            <div className="hub-project-portfolio-index__empty">
              <Iconed name={query || activeFilter ? "search" : "projects"} size={22} />
              <strong>{query || activeFilter ? "조건에 맞는 프로젝트 없음" : "프로젝트 없음"}</strong>
              <span>{query || activeFilter ? "검색어나 필터를 지워보세요." : "새 프로젝트를 추가해 시작하세요."}</span>
            </div>
          ) : projects.map((item) => (
            <ProjectIndexRow
              key={item.id}
              project={item}
              brand={brandByKey.get(item.brand) || brands[0] || null}
              selected={project?.id === item.id}
              keyboardSelected={keyboardSelectedId === item.id}
              window={window}
              onSelect={selectProject}
            />
          ))}

          {terminalProjects.length > 0 && (
            <div className="hub-project-portfolio-terminal">
              <button type="button" className="hub-row" aria-expanded={showTerminal} onClick={onToggleTerminal}>
                <Iconed name="chevronD" size={12} style={{ transform: showTerminal ? "none" : "rotate(-90deg)" }} />
                <span>완료·보관</span>
                <span className="mono">{terminalProjects.length}</span>
              </button>
              {showTerminal && terminalProjects.map((item) => (
                <div key={item.id} className="hub-project-portfolio-terminal__row">
                  <button type="button" onClick={() => onOpenProject(item.id)}>{item.name}</button>
                  <button type="button" aria-label={`${item.name} 다시 열기`} onClick={() => onReopenProject(item)}>
                    <Iconed name="play" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hub-project-portfolio-index__footer">
          {project?.brand && project.brand !== "all" && (
            <button type="button" onClick={() => onCreateContent(project.brand)}>
              <Iconed name="content" size={14} />콘텐츠 추가
            </button>
          )}
          <button type="button" onClick={onCreateProject}>
            <Iconed name="plus" size={15} />프로젝트 추가
          </button>
        </div>
      </aside>

      <main className="hub-project-portfolio-stage scroll-y">
        {createSurface ? (
          <div className="hub-project-portfolio-stage__create">{createSurface}</div>
        ) : (
          <div className={`hub-project-portfolio-stage__inner ${deliveryStyles.portfolio}`}>
          <header className="hub-project-portfolio-stage__header">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", gap: 16 }}>
              <div>
                <span className={deliveryStyles.eyebrow}>{brand?.name || "프로젝트"}</span>
                <h1>{project?.name || "프로젝트"}</h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {onSwitchView && (
                  <Button variant="outline" size="sm" onClick={() => onSwitchView("table")}>
                    목록(Table)으로 보기 →
                  </Button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {activeFilter ? (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "3px 10px", borderRadius: "var(--r-sm)",
                  background: "var(--surface-3)", border: "1px solid var(--moon-300)",
                  fontSize: 11, color: "var(--fg)",
                }}>
                  <span style={{ color: "var(--fg-faint)" }}>필터:</span>
                  <strong>{METRIC_FILTERS.find(m => m.key === activeFilter)?.label || activeFilter}</strong>
                  <span className="mono" style={{ color: "var(--moon-300)" }}>{metrics[activeFilter]}</span>
                  <button
                    type="button"
                    onClick={() => onFilterChange(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-faint)", padding: "0 2px", fontSize: 12 }}
                    aria-label="필터 해제"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              <Button
                variant={showFilterPicker ? "outline" : "ghost"}
                size="xs"
                onClick={() => setShowFilterPicker(v => !v)}
              >
                <Iconed name="search" size={12} /> {showFilterPicker ? "필터 닫기" : "필터"}
              </Button>
              {showFilterPicker && (
                <div className="hub-project-portfolio-metrics" aria-label="포트폴리오 요약" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {METRIC_FILTERS.map((metric) => (
                    <PortfolioMetric
                      key={metric.key}
                      metric={metric}
                      count={metrics[metric.key]}
                      active={activeFilter === metric.key}
                      lowerBound={lowerBound}
                      onSelect={(key) => {
                        onFilterChange(key);
                        setShowFilterPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </header>

          {sourceState === "error" && (
            <div className="hub-project-portfolio-truth" role="alert" data-state="error">
              <Iconed name="flag" size={15} />
              <span><strong>프로젝트 원장을 읽지 못했습니다.</strong>{readError || "연결 상태를 확인한 뒤 다시 시도하세요."}</span>
              <Button variant="outline" size="sm" onClick={onReload}>다시 시도</Button>
            </div>
          )}
          {sourceState === "partial" && (
            <div className="hub-project-portfolio-truth" role="status" data-state="partial">
              <Iconed name="signal" size={15} />
              <span><strong>일부 데이터만 표시 중입니다.</strong>{failedSources.length ? `${failedSources.join(", ")} 기록을 확인할 수 없습니다.` : "읽힌 프로젝트와 할 일 데이터는 유지합니다."}</span>
              <Button variant="outline" size="sm" onClick={onReload}>다시 시도</Button>
            </div>
          )}

          {project ? (
            <>
              <div className="hub-project-delivery-compact-bar" style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 14px", background: "var(--surface-2)", border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-sm)", fontSize: 12, gap: 12, marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Iconed name="flag" size={14} style={{ color: "var(--moon-300)", flexShrink: 0 }} />
                  <span style={{ color: "var(--fg-faint)", flexShrink: 0 }}>결과물 계획</span>
                  <strong style={{ fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {project.delivery?.deliverable || "최소 결과물 미정"}
                  </strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <Button variant="ghost" size="xs" onClick={() => setShowDeliveryPlan(v => !v)}>
                    {showDeliveryPlan ? "계획 접기 ▲" : "계획 상세 ▼"}
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => onManageDelivery?.(project)}>
                    계획·검증
                  </Button>
                </div>
              </div>
              {showDeliveryPlan && (
                <div style={{ marginBottom: 12 }}>
                  <ProjectDeliverySummary project={project} onManage={onManageDelivery} compact />
                </div>
              )}

              <section className="hub-project-portfolio-hero" style={{ padding: "14px 18px", marginBottom: 16 }}>
                <div className="hub-project-portfolio-hero__project">
                  <div className="hub-project-portfolio-hero__value stat" style={{ fontSize: 32 }}>
                    {progress === null ? <span className="is-empty">—</span> : <>{progress}<small>%</small></>}
                  </div>
                  <div className="hub-project-portfolio-hero__identity">
                    <span>{brand?.name || "프로젝트"}</span>
                    <h2>작업 진척</h2>
                    <p>{project.displaySummary || project.projectSummary || "프로젝트의 목표 결과와 실행 근거를 상세에서 정리할 수 있습니다."}</p>
                    <span className="hub-project-portfolio-hero__due">
                      <Iconed name="calendar" size={14} />{formatLongDate(project.dueAt)}
                      {dday && <Badge tone={dday.tone} size="xs">{dday.text}</Badge>}
                    </span>
                  </div>
                </div>

                <div className="hub-project-portfolio-hero__action">
                  <span>다음 행동</span>
                  <h3 style={{ fontSize: 15, margin: "4px 0 6px" }}>{nextAction}</h3>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Button variant="primary" size="sm" onClick={() => onOpenProject(project.id)}>
                      프로젝트 열기 <Iconed name="arrowRight" size={14} />
                    </Button>
                  </div>
                </div>

                <div className="hub-project-portfolio-ruler" style={{ marginTop: 12 }}>
                  <div className="hub-project-portfolio-ruler__labels">
                    <span>프로젝트 진척 · {doneTasksCount}/{totalTasks} 완료</span>
                    <span>{dueDays === null ? "기한 미정" : dueDays < 0 ? `${Math.abs(dueDays)}일 지남` : dueDays === 0 ? "오늘 마감" : `마감 ${dueDays}일`}</span>
                    <span className={risk.risky ? "is-risk" : ""}><Iconed name={risk.risky ? "flag" : "check"} size={12} />{risk.label}</span>
                  </div>
                  <div className="hub-project-portfolio-ruler__track" aria-hidden="true">
                    {Array.from({ length: 13 }, (_, index) => <i key={index} style={{ left: `${(index / 12) * 100}%` }} />)}
                    <span style={{ width: `${progress ?? 0}%` }} />
                    {progress !== null && <b style={{ left: `${progress}%` }} />}
                  </div>

                  {totalTasks > 0 && (
                    <div className="hub-project-status-bar" style={{ marginTop: 8 }}>
                      <div className="hub-project-status-bar__track">
                        {doneTasksCount > 0 && <span style={{ width: `${(doneTasksCount / totalTasks) * 100}%` }} data-status="done" title={`완료 ${doneTasksCount}개`} />}
                        {doingTasksCount > 0 && <span style={{ width: `${(doingTasksCount / totalTasks) * 100}%` }} data-status="doing" title={`진행 ${doingTasksCount}개`} />}
                        {todoTasksCount > 0 && <span style={{ width: `${(todoTasksCount / totalTasks) * 100}%` }} data-status="todo" title={`대기 ${todoTasksCount}개`} />}
                        {blockedTasksCount > 0 && <span style={{ width: `${(blockedTasksCount / totalTasks) * 100}%` }} data-status="blocked" title={`막힘 ${blockedTasksCount}개`} />}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <div className="hub-project-portfolio-accordions">
                <PortfolioAccordion
                  id="items"
                  icon="folder"
                  label="하위 아이템"
                  count={projectTasks.length}
                  summary={(
                    <span className="hub-project-portfolio-visual-summary">
                      <span className="hub-project-portfolio-mini-bars" aria-hidden="true">
                        {(taskStatuses.length ? taskStatuses : [{ status: "empty", count: 0 }]).slice(0, 4).map((entry) => (
                          <i key={entry.status} data-status={entry.status} style={{ width: `${Math.max(18, (entry.count / Math.max(1, projectTasks.length)) * 100)}%` }} />
                        ))}
                      </span>
                      <em>{taskStatuses.length ? taskStatuses.map((entry) => `${STATUS_COPY[entry.status] || entry.status} ${entry.count}`).join(" · ") : "등록된 항목 없음"}</em>
                    </span>
                  )}
                  open={Boolean(openSections.items)}
                  onToggle={() => toggleSection("items")}
                >
                  {taskStatuses.length ? (
                    <div className="hub-project-portfolio-status-grid">
                      {taskStatuses.map((entry) => (
                        <div key={entry.status} data-status={entry.status}>
                          <span>{STATUS_COPY[entry.status] || entry.status}</span>
                          <strong className="mono">{entry.count}</strong>
                        </div>
                      ))}
                    </div>
                  ) : <span className="hub-project-portfolio-panel-empty">하위 아이템이 없습니다.</span>}
                </PortfolioAccordion>

                <PortfolioAccordion
                  id="checklist"
                  icon="orders"
                  label="체크리스트"
                  count={`${doneTasks.length}/${projectTasks.length}`}
                  summary={(
                    <span className="hub-project-portfolio-visual-summary">
                      <span className="hub-project-portfolio-mini-progress" aria-hidden="true"><i style={{ width: `${projectTasks.length ? (doneTasks.length / projectTasks.length) * 100 : 0}%` }} /></span>
                      <em>{nextTask ? `다음 · ${nextTask.title}` : projectTasks.length ? "모든 항목 완료" : "체크리스트 비어 있음"}</em>
                    </span>
                  )}
                  open={Boolean(openSections.checklist)}
                  onToggle={() => toggleSection("checklist")}
                >
                  {projectTasks.length ? (
                    <div className="hub-project-portfolio-task-list">
                      {projectTasks.map((task) => (
                        <div key={task.id} data-done={task.done ? "true" : "false"}>
                          <Checkbox
                            checked={task.done}
                            onChange={() => onToggleTodo(task.id)}
                            disabled={pendingTodoIds.has(task.id)}
                            size={16}
                            label={`${task.done ? "다시 열기" : "완료"}: ${task.title}`}
                          />
                          <button type="button" onClick={() => onEditTodo(task)}>{task.title}</button>
                          <span className="mono">{formatScheduleDate(task.dueAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <span className="hub-project-portfolio-panel-empty">체크리스트가 비어 있습니다.</span>}
                  <button type="button" className="hub-project-portfolio-panel-add" onClick={() => onCreateTodo(project.id)}>
                    <Iconed name="plus" size={13} />하위 아이템 추가
                  </button>
                </PortfolioAccordion>

                <PortfolioAccordion
                  id="schedule"
                  icon="calendar"
                  label="일정"
                  count={datedTasks.length + (project.dueAt ? 1 : 0)}
                  summary={(
                    <span className="hub-project-portfolio-visual-summary">
                      <span className="hub-project-portfolio-mini-schedule" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, index) => <i key={index} data-active={index < Math.min(4, datedTasks.length + (project.dueAt ? 1 : 0)) ? "true" : "false"} />)}
                      </span>
                      <em>{datedTasks[0] ? `${formatScheduleDate(datedTasks[0].dueAt)} · ${datedTasks[0].title}` : formatLongDate(project.dueAt)}</em>
                    </span>
                  )}
                  open={Boolean(openSections.schedule)}
                  onToggle={() => toggleSection("schedule")}
                >
                  <div className="hub-project-portfolio-schedule-list">
                    {project.dueAt && (
                      <div className="is-project-due"><Iconed name="flag" size={13} /><strong>{formatScheduleDate(project.dueAt)}</strong><span>프로젝트 마감</span></div>
                    )}
                    {datedTasks.map((task) => (
                      <button type="button" key={task.id} onClick={() => onEditTodo(task)}>
                        <Iconed name="clock" size={13} /><strong>{formatScheduleDate(task.dueAt)}</strong><span>{task.title}</span>
                      </button>
                    ))}
                    {!project.dueAt && datedTasks.length === 0 && <span className="hub-project-portfolio-panel-empty">기한이 지정된 일정이 없습니다.</span>}
                  </div>
                  {updates && updates.filter((u) => u.projectId === project.id).length > 0 && (
                    <div style={{ marginTop: 14, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 8 }}>최근 업데이트 기록</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {updates.filter((u) => u.projectId === project.id).slice(0, 4).map((u) => (
                          <div key={u.id} style={{ fontSize: 11.5, color: "var(--fg-faint)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>{u.happenedAtLabel || "최근"}</span>
                            <span style={{ color: "var(--fg)" }}>{u.title}</span>
                            {u.summary && <span style={{ color: "var(--fg-muted)" }}>· {u.summary}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </PortfolioAccordion>
              </div>
            </>
          ) : (
            <div className="hub-project-portfolio-stage__empty">
              <Iconed name={query || activeFilter ? "search" : "projects"} size={28} />
              <h2>{sourceState === "loading" ? "프로젝트 원장 확인 중" : query || activeFilter ? "조건에 맞는 프로젝트가 없습니다" : sourceState === "preview" ? "Preview · 실제 프로젝트 없음" : "첫 프로젝트를 시작하세요"}</h2>
              <p>{sourceState === "loading" ? "원장 상태를 확인하고 있습니다." : query || activeFilter ? "왼쪽 검색 또는 포트폴리오 필터를 해제하면 전체 프로젝트가 돌아옵니다." : sourceState === "preview" ? "Supabase가 연결되면 예시 데이터 없이 실제 프로젝트만 표시합니다." : "프로젝트를 만들면 진척, 다음 행동, 체크리스트와 일정을 한 화면에서 관리할 수 있습니다."}</p>
              {sourceState === "loading" ? null : query || activeFilter ? (
                <Button variant="outline" size="sm" onClick={() => { onQueryChange(""); onFilterChange(null); }}>검색·필터 지우기</Button>
              ) : (
                <Button variant="primary" size="sm" icon="plus" onClick={onCreateProject}>프로젝트 추가</Button>
              )}
            </div>
          )}
          </div>
        )}
      </main>
    </div>
  );
}
