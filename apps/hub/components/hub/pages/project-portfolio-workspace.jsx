"use client";

import React from "react";
import { Badge, Button, Drawer, Input } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { readTaskChecklist } from '@/lib/task-checklist';
import { ProjectWorkList } from './project-work-list';
import workStyles from './project-direct-work.module.css';
import deliveryStyles from "./project-delivery.module.css";
import { ProjectDeliverySummary } from "./project-delivery";
import { BrandMark } from "./project-pms-components";
import { classifyProjectPortfolio, portfolioWindow } from "./project-pms-metrics";
import { selectUrgentProjectItems } from '@/lib/project-urgent-items';
import { buildCurrentMonthProjectPreview } from '@/lib/project-monthly-preview';

const METRIC_FILTERS = [
  { key: "active", label: "진행" },
  { key: "blockedOrOverdue", label: "위험" },
  { key: "dueSoon", label: "7일 내" },
  { key: "unmeasured", label: "미측정" },
];

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

function formatEvidenceDate(value) {
  const date = dateValue(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).format(date);
}

function projectRisk(project, window) {
  const flags = classifyProjectPortfolio(project, window);
  if (!flags.blockedOrOverdue) return { risky: false, label: project?.deadlineAlertSuppressed ? "이전 기한 · 알림 해제" : project?.dueAt ? "현재 확인된 신호 없음" : "판단 자료 부족" };
  const status = String(project?.statusKey || project?.status || "").toLowerCase();
  if (status === "blocked") return { risky: true, label: "막힘" };
  return { risky: true, label: "기한 지남" };
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
  const dday = project.deadlineAlertSuppressed ? null : computeDDay(project.dueAt);
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
        {(risk.risky || project.deadlineAlertSuppressed) && <span className={risk.risky ? "is-risk" : ""}>
          <Iconed name={risk.risky ? "flag" : "clock"} size={12} />{risk.label}
        </span>}
      </span>
    </button>
  );
}

function MonthlyProjectRow({ project, onOpen }) {
  const progress = progressValue(project);
  return (
    <button type="button" className="hub-project-monthly-row hub-row" onClick={() => onOpen(project.id)}>
      <span><strong>{project.name}</strong><small>{project.entityLabel || '고객 연결 없음'}</small></span>
      <span className="mono">{progress === null ? '진척 미집계' : `${progress}%`}</span>
      <Iconed name="arrowRight" size={13} />
    </button>
  );
}

export function ProjectPortfolioWorkspace({
  projects = [],
  portfolioProjects = [],
  reviewProjects = [],
  terminalProjects = [],
  todosByProject,
  brandByKey,
  brands = [],
  selectedProjectId,
  selectedProjectRecord,
  focusTaskId,
  focusCheckId,
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
  onSelectProject,
  onOpenCustomer,
  onEditProject,
  onRemoveProject,
  onCreateProject,
  onManageDelivery,
  onCreateContent,
  onQuickCreateTodo,
  onAddChecklistItem,
  canWriteTasks,
  onEditTodo,
  onToggleTodo,
  onToggleChecklist,
  pendingTodoIds,
  showTerminal,
  onToggleTerminal,
  onTerminalDragStart,
  onTerminalDragMove,
  onTerminalDragEnd,
  onReopenProject,
  onReload,
  onSwitchView,
  updates = [],
  createSurface = null,
}) {
  const [focusProjectId, setFocusProjectId] = React.useState(null);
  const [showFilterPicker, setShowFilterPicker] = React.useState(false);
  const [showMobilePicker, setShowMobilePicker] = React.useState(false);
  const [showMonthlyPreview, setShowMonthlyPreview] = React.useState(false);
  const workListRef = React.useRef(null);
  const [workDrafts, setWorkDrafts] = React.useState({});
  const workDraftsRef = React.useRef({});
  const focusedEntryRef = React.useRef(null);
  const window = React.useMemo(() => portfolioWindow(), []);
  const selectedProject = selectedProjectRecord || projects.find((project) => project.id === selectedProjectId);
  const locallyFocused = projects.find((project) => project.id === focusProjectId);
  const project = locallyFocused || selectedProject || (!selectedProjectId ? projects[0] : null) || null;
  const missingSelection = Boolean(selectedProjectId && !selectedProject && !locallyFocused && sourceState !== 'loading');
  React.useEffect(() => setFocusProjectId(null), [selectedProjectId]);
  const projectTasks = project ? (todosByProject.get(project.id) || []) : [];
  const urgentItems = React.useMemo(() => selectUrgentProjectItems(projectTasks), [projectTasks]);
  const monthlyPreview = React.useMemo(() => buildCurrentMonthProjectPreview(reviewProjects), [reviewProjects]);
  const focusTask = React.useCallback((taskId, checkId = null) => workListRef.current?.focusTask(taskId, checkId), []);
  React.useEffect(() => {
    if (!project?.id || !focusTaskId || !projectTasks.some(task => task.id === focusTaskId)) return;
    const key = `${project.id}:${focusTaskId}:${focusCheckId || ''}`;
    if (focusedEntryRef.current === key) return;
    focusedEntryRef.current = key;
    focusTask(focusTaskId, focusCheckId);
  }, [project?.id, projectTasks, focusTaskId, focusCheckId, focusTask]);
  const openTasks = projectTasks.filter((task) => !task.done);
  const datedTasks = projectTasks.flatMap(task => [
    ...(task.dueAt ? [{ ...task, scheduleKey: task.id, parentTask: task }] : []),
    ...readTaskChecklist(task).filter(item => item.dueAt).map(item => ({
      ...item, scheduleKey: `${task.id}-${item.id}`, title: `${task.title} · ${item.title}`, parentTask: task,
    })),
  ])
    .filter((task) => dateValue(task.dueAt))
    .slice()
    .sort((a, b) => dateValue(a.dueAt) - dateValue(b.dueAt));
  const projectUpdates = updates.filter((item) => item.projectId === project?.id);
  const scheduleCount = datedTasks.length + (project?.dueAt ? 1 : 0);
  const nextSchedule = [
    ...(project?.dueAt ? [{ dueAt: project.dueAt, title: "프로젝트 마감" }] : []),
    ...datedTasks,
  ].sort((a, b) => dateValue(a.dueAt) - dateValue(b.dueAt))[0] || null;
  const nextTask = openTasks.slice().sort((a, b) => {
    const aDue = dateValue(a.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = dateValue(b.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDue - bDue;
  })[0] || null;
  const progress = progressValue(project);
  const taskProgress = progress !== null && project?.displayProgress?.source === 'tasks';
  const reportedProgress = progress !== null && project?.displayProgress?.source === 'reported';
  const latestTaskRecord = taskProgress ? projectTasks.reduce((latest, task) => {
    const recorded = dateValue(task.updatedAt);
    return recorded && (!latest || recorded > latest) ? recorded : latest;
  }, null) : null;
  const evidenceDate = formatEvidenceDate(taskProgress ? latestTaskRecord : reportedProgress && Number.isFinite(project.latestUpdate?.progress) ? project.latestUpdate.happenedAt : null);
  const evidenceDetail = taskProgress ? `항목 ${project.displayProgress.done}/${project.displayProgress.total} 완료`
    : reportedProgress ? project.displayProgress.label : '진척 미측정';
  const evidenceTime = progress === null ? null : evidenceDate ? `${taskProgress ? '최근 항목 기록' : '보고 기록'} ${evidenceDate}` : '기록 시점 미확인';
  const risk = project ? projectRisk(project, window) : { risky: false, label: "위험 없음" };
  const dday = project && !project.deadlineAlertSuppressed ? computeDDay(project.dueAt) : null;
  const brand = project
    ? (brandByKey.get(project.brand) || brands[0] || null)
    : null;
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
    setShowMobilePicker(false);
    onSelectProject?.(projectId);
  };
  const nextAction = project?.displayNextAction || project?.projectNextAction || nextTask?.title;
  const actionTask = nextAction ? openTasks.find(task => task.title.trim() === nextAction.trim()) : null;
  const nextActionSource = actionTask ? '연결된 할 일' : nextAction ? (project?.projectNextAction === nextAction ? '프로젝트 기록' : '최근 업데이트') : '미정';
  const lowerBound = Boolean(projectCorePartial || sourceState === "partial");

  return (
    <div
      className={`hub-project-portfolio-workspace ${workStyles.workspace}`}
      data-detail-open={openDetailId ? "true" : "false"}
      data-create-open={createSurface ? "true" : "false"}
      data-mobile-picker={showMobilePicker ? "true" : "false"}
      data-has-project={project ? "true" : "false"}
    >
      <aside className="hub-project-portfolio-index" aria-label="프로젝트 인덱스">
        <div className="hub-project-portfolio-index__header">
          <div>
            <strong>프로젝트 선택</strong>
            <span className="mono">{portfolioProjects.length}{projectCorePartial ? "+" : ""}</span>
            <button type="button" className="hub-project-portfolio-index__close" onClick={() => setShowMobilePicker(false)}>닫기</button>
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
              <button
                type="button"
                className="hub-row"
                data-terminal-toggle=""
                aria-expanded={showTerminal}
                onClick={onToggleTerminal}
              >
                <Iconed name="chevronD" size={12} style={{ transform: showTerminal ? "none" : "rotate(-90deg)" }} />
                <span>완료·보관</span>
                <span className="mono">{terminalProjects.length}</span>
                <span
                  data-terminal-grip=""
                  aria-hidden="true"
                  onPointerDown={onTerminalDragStart}
                  onPointerMove={onTerminalDragMove}
                  onPointerUp={onTerminalDragEnd}
                  onPointerCancel={onTerminalDragEnd}
                  style={{ color: "var(--fg-faint)" }}
                >
                  <Iconed name="drag" size={12} />
                </span>
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
            <div className="hub-project-portfolio-stage__title-row">
              <div>
                <span className={deliveryStyles.eyebrow}>선택한 프로젝트 · {brand?.name || "소속 미정"}</span>
                <h1>{project?.name || "프로젝트"}</h1>
                {project?.entityRef && (
                  <button type="button" className="hub-project-portfolio-stage__customer hub-row" onClick={() => onOpenCustomer?.(project.id)}>
                    <Iconed name="user" size={12} />{project.entityLabel || '연결된 고객'}<Iconed name="chevronR" size={12} />
                  </button>
                )}
              </div>
              <div className="hub-project-portfolio-stage__actions">
                <span className={workStyles.mobileOnly}><Button variant="outline" size="sm" onClick={() => setShowMobilePicker(true)}>프로젝트 바꾸기</Button></span>
                {project && <Button variant="outline" size="sm" icon="pencil" onClick={() => onEditProject?.(project)}>편집</Button>}
                <details className={workStyles.manage}>
                  <summary aria-label="프로젝트 관리">관리 <Iconed name="chevronD" size={12} /></summary>
                  <div>
                    <button type="button" onClick={() => setShowMonthlyPreview(true)}>이번 달 평가</button>
                    {onSwitchView && <button type="button" onClick={() => onSwitchView("table")}>전체 목록 보기</button>}
                    {project && <button type="button" onClick={() => onManageDelivery?.(project)}>결과·완료 기준</button>}
                    {project && project.statusKey !== "archived" && <button type="button" onClick={() => onRemoveProject?.(project)}>프로젝트 보관</button>}
                  </div>
                </details>
              </div>
            </div>
            <div className="hub-project-portfolio-stage__filter">
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
              <span><strong>프로젝트 기록을 읽지 못했습니다.</strong>{readError || "연결 상태를 확인한 뒤 다시 시도하세요."}</span>
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
              <section className={workStyles.overview} aria-label="프로젝트 실행 요약">
                <div className={workStyles.nextAction}>
                  <span>다음 행동 · {nextActionSource}</span>
                  <strong>{nextAction || '첫 할 일을 적고 바로 시작하세요'}</strong>
                  <Button variant="outline" size="sm" icon="arrowRight" onClick={() => actionTask ? focusTask(actionTask.id) : workListRef.current?.focusNewTask(nextAction || '')}>
                    {actionTask ? '목록에서 보기' : nextAction ? '할 일로 추가' : '할 일 추가'}
                  </Button>
                </div>
                <div className={workStyles.progressSummary}>
                  <div><strong className="stat">{progress === null ? '—' : <>{progress}<small>%</small></>}</strong><span>{evidenceDetail}</span></div>
                  {progress !== null && <div className={workStyles.progressTrack} role="progressbar" aria-label="프로젝트 진척" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}% · ${evidenceDetail} · ${evidenceTime}`}>
                    <span style={{ width: `${progress}%` }} />
                    {[25, 50, 75].map(value => <i key={value} style={{ left: `${value}%` }} />)}
                  </div>}
                  {evidenceTime && <span className={workStyles.progressMeta}>{evidenceTime}</span>}
                  <span className={workStyles.progressMeta}><Iconed name="calendar" size={12} />{formatLongDate(project.dueAt)}{dday && <Badge tone={dday.tone} size="xs">{dday.text}</Badge>}{risk.risky && <span className={workStyles.risk}>{risk.label}</span>}</span>
                  {project.displayProgress?.partial && <span className={workStyles.progressMeta}>진척 근거를 일부 읽지 못했습니다.</span>}
                  {project.displayProgress?.evidencePartial && <span className={workStyles.progressMeta}>업데이트 기록 일부 확인 불가</span>}
                  {progress === null && !project.displayProgress?.partial && <span className={workStyles.progressMeta}>할 일이나 보고값을 추가하면 진척을 표시합니다.</span>}
                  {progress === 100 && project.statusKey !== 'completed' && <span className={workStyles.progressMeta}>프로젝트 완료는 결과물 검증 후</span>}
                </div>
              </section>

              {urgentItems.length > 0 && (
                <section className="hub-project-portfolio-urgent" aria-label="먼저 처리할 할 일">
                  <div className="hub-project-portfolio-urgent__heading"><strong>먼저 처리</strong><span className="num">{urgentItems.length}</span></div>
                  <div className="hub-project-portfolio-urgent__list">
                    {urgentItems.slice(0, 3).map(item => (
                      <button type="button" key={item.taskId} className="hub-row" onClick={() => focusTask(item.taskId, item.checkId)}>
                        <span className={item.blocked || item.rank === 0 ? 'is-risk' : ''}>{item.reason}</span>
                        <strong>{item.title}</strong>
                        {item.checkTitle && <em>다음 체크 · {item.checkTitle}</em>}
                        <Iconed name="arrowRight" size={13} />
                      </button>
                    ))}
                    {urgentItems.length > 3 && <span className="hub-project-portfolio-urgent__more">외 {urgentItems.length - 3}건은 아래에서 확인</span>}
                  </div>
                </section>
              )}

              <ProjectWorkList ref={workListRef} projectId={project.id} tasks={projectTasks}
                draftStore={{ drafts: workDrafts, setDrafts: setWorkDrafts, draftsRef: workDraftsRef }}
                canWrite={canWriteTasks && project.statusKey !== 'archived'} pendingIds={pendingTodoIds}
                onCreate={onQuickCreateTodo} onAddChecklist={onAddChecklistItem}
                onToggleTask={onToggleTodo} onToggleChecklist={onToggleChecklist} onEdit={onEditTodo} />

              <ProjectDeliverySummary project={project} onManage={onManageDelivery} compact />
              <section className={workStyles.support} aria-label="프로젝트 참고 정보">
                  {scheduleCount > 0 && (
                    <details className="hub-project-portfolio-support">
                      <summary className="hub-row"><Iconed name="calendar" size={14} /><strong>일정 {scheduleCount}</strong><span>{nextSchedule ? `${formatScheduleDate(nextSchedule.dueAt)} · ${nextSchedule.title}` : ""}</span><Iconed name="chevronD" size={14} /></summary>
                      <div className="hub-project-portfolio-schedule-list">
                        {project.dueAt && <div className="is-project-due"><Iconed name="flag" size={13} /><strong>{formatScheduleDate(project.dueAt)}</strong><span>프로젝트 마감</span></div>}
                        {datedTasks.map((task) => (
                          <button type="button" key={task.scheduleKey} onClick={() => onEditTodo(task.parentTask)}>
                            <Iconed name="clock" size={13} /><strong>{formatScheduleDate(task.dueAt)}</strong><span>{task.title}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  {projectUpdates.length > 0 && (
                    <details className="hub-project-portfolio-support">
                      <summary className="hub-row"><Iconed name="clock" size={14} /><strong>최근 업데이트 기록</strong><span>{projectUpdates[0].happenedAtLabel || "최근"}</span><Iconed name="chevronD" size={14} /></summary>
                      <div className="hub-project-portfolio-support__updates">
                        {projectUpdates.slice(0, 4).map((item) => (
                          <div key={item.id}><span className="mono">{item.happenedAtLabel || "최근"}</span><span><strong>{item.title}</strong>{item.summary && <> · {item.summary}</>}</span></div>
                        ))}
                      </div>
                    </details>
                  )}
              </section>
            </>
          ) : (
            <div className="hub-project-portfolio-stage__empty">
              <Iconed name={query || activeFilter ? "search" : "projects"} size={28} />
              <h2>{sourceState === "loading" ? "프로젝트 기록 확인 중" : missingSelection ? "요청한 프로젝트를 찾을 수 없습니다" : query || activeFilter ? "조건에 맞는 프로젝트가 없습니다" : sourceState === "preview" ? "Preview · 실제 프로젝트 없음" : "첫 프로젝트를 시작하세요"}</h2>
              <p>{sourceState === "loading" ? "기록 상태를 확인하고 있습니다." : missingSelection ? "접근 가능한 소속과 프로젝트 상태를 확인한 뒤 다시 선택하세요." : query || activeFilter ? "왼쪽 검색 또는 포트폴리오 필터를 해제하면 전체 프로젝트가 돌아옵니다." : sourceState === "preview" ? "Supabase가 연결되면 예시 데이터 없이 실제 프로젝트만 표시합니다." : "프로젝트를 만들면 진척, 다음 행동, 체크리스트와 일정을 한 화면에서 관리할 수 있습니다."}</p>
              {sourceState === "loading" ? null : missingSelection ? (
                projects[0] ? <Button variant="outline" size="sm" onClick={() => selectProject(projects[0].id)}>프로젝트 선택</Button> : null
              ) : query || activeFilter ? (
                <Button variant="outline" size="sm" onClick={() => { onQueryChange(""); onFilterChange(null); }}>검색·필터 지우기</Button>
              ) : (
                <Button variant="primary" size="sm" icon="plus" onClick={onCreateProject}>프로젝트 추가</Button>
              )}
            </div>
          )}
          </div>
        )}
      </main>
      {showMonthlyPreview && (
        <Drawer
          title={`${monthlyPreview.month.replace('-', '년 ')}월 프로젝트 평가`}
          subtitle="현재 기록 기준 · 잠정"
          width="min(460px, 94vw)"
          onClose={() => setShowMonthlyPreview(false)}
        >
          <div className="hub-project-monthly-preview">
            <p>진행 중인 달의 현재 상태입니다. 완료 후 다시 열거나 보관하면 과거 결과가 달라질 수 있어 확정 월 실적으로 사용하지 않습니다.</p>
            {sourceState === 'partial' && <p role="status">일부 프로젝트 기록을 읽지 못해 숫자가 실제보다 적을 수 있습니다.</p>}
            <div className="hub-project-monthly-preview__stats">
              <span><strong className="stat">{monthlyPreview.completed.length}{projectCorePartial ? '+' : ''}</strong>이번 달 완료</span>
              <span><strong className="stat">{monthlyPreview.ongoing.length}{projectCorePartial ? '+' : ''}</strong>현재 진행</span>
              <span><strong className="stat">{monthlyPreview.blocked.length}{projectCorePartial ? '+' : ''}</strong>그중 막힘</span>
            </div>
            <p>연결 고객·리드 {monthlyPreview.linkedCustomerCount}명 · 프로젝트별 연결만 집계</p>
            <section><h3>이번 달 완료</h3>
              {monthlyPreview.completed.length ? monthlyPreview.completed.map(item => <MonthlyProjectRow key={item.id} project={item} onOpen={id => { setShowMonthlyPreview(false); onOpenProject(id); }} />) : <span className="hub-project-monthly-preview__empty">완료일이 확인된 프로젝트가 없습니다.</span>}
            </section>
            <section><h3>현재 진행</h3>
              {monthlyPreview.ongoing.length ? monthlyPreview.ongoing.map(item => <MonthlyProjectRow key={item.id} project={item} onOpen={id => { setShowMonthlyPreview(false); onOpenProject(id); }} />) : <span className="hub-project-monthly-preview__empty">진행 중인 프로젝트가 없습니다.</span>}
            </section>
            {monthlyPreview.undatedCompleted.length > 0 && <p>완료일을 확인할 수 없는 완료 프로젝트 {monthlyPreview.undatedCompleted.length}건은 이번 달 완료 수에서 제외했습니다.</p>}
          </div>
        </Drawer>
      )}
    </div>
  );
}
