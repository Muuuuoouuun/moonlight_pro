"use client";

import React from "react";
import { RelatedMemos } from '../related-memos';
import { GoalLinks } from '../goal-links';
import { Badge, Button, Checkbox, IconButton, SegmentedControl, TruthBadge } from "../hub-primitives";
import { projectCustomerRef, projectMemoContexts } from '@/lib/project-customer-context';
import { ProjectCustomerPanel } from './project-customer-panel';
import './project-focus.css';
import { ProjectDeliverySummary } from "./project-delivery";
import { BrandMark, ProjectProgressGauge, ProjectStatusBadge } from "./project-pms-components";
import { TaskChecklistGauge } from './project-task-checklist';

function DetailSection({ title, count = 0, empty, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 8, display: "flex", alignItems: "center" }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{count}</span>
      </div>
      {count > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      ) : (
        <div style={{ padding: "10px 11px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", color: "var(--fg-faint)", fontSize: 11.5 }}>
          {empty}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ title, body, meta, badge, tone = "neutral" }) {
  return (
    <div style={{ padding: "9px 10px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {badge && <Badge tone={tone} size="xs">{badge}</Badge>}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.2, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {meta && <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>{meta}</span>}
      </div>
      {body && <div style={{ marginTop: 5, color: "var(--fg-muted)", fontSize: 11.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{body}</div>}
    </div>
  );
}

function progressLabel(project) {
  const progress = project.displayProgress;
  if (!progress) return "진척 데이터 없음";
  const count = progress.done !== null && progress.total !== null
    ? ` · ${progress.done}/${progress.total}`
    : "";
  const evidenceNote = project.updateEvidencePartial ? " · 업데이트 기록 미확인" : "";
  return `${progress.value === null ? "" : `${progress.value}% · `}${progress.label}${count}${evidenceNote}`;
}

function ProjectNotes({ notes, partial, failed }) {
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matching = notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(normalizedQuery));
  const visible = expanded || normalizedQuery ? matching : matching.slice(0, 4);

  return (
    <section aria-label="연결 메모">
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
        연결 메모 · {notes.length}{partial ? "+" : ""}건
      </div>
      {(partial || failed) && (
        <p role="status" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
          {failed ? "메모 읽기에 실패했습니다. 현재 표시된 기록만 검색합니다. 새로고침해 다시 확인하세요." : "일부 메모만 불러왔습니다. 검색은 불러온 기록 안에서만 진행됩니다."}
        </p>
      )}
      {notes.length > 0 && (
        <input
          type="search"
          aria-label="연결 메모 제목·본문 검색"
          placeholder="불러온 메모 제목·본문 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: "100%", minHeight: 44, padding: "8px 10px", marginBottom: 8, background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", color: "var(--fg)", fontSize: 12 }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((note) => (
          <details key={note.id} style={{ padding: "9px 10px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", overflowWrap: "anywhere" }}>
            <summary style={{ cursor: "pointer", minHeight: 44, fontSize: 12, color: "var(--fg)" }}>
              {note.title}
              <span style={{ display: "block", color: "var(--fg-muted)", fontSize: 11, marginTop: 4 }}>{note.createdAtLabel}</span>
            </summary>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.55 }}>{note.body || "본문 없음"}</div>
          </details>
        ))}
        {visible.length === 0 && (
          <div role="status" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
            {normalizedQuery ? "불러온 메모에서 검색 결과가 없습니다." : failed ? "연결 메모를 확인할 수 없습니다." : "이 프로젝트에 연결된 메모가 없습니다."}
          </div>
        )}
      </div>
      {!normalizedQuery && notes.length > 4 && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} style={{ minHeight: 44, fontSize: 12, color: "var(--fg-muted)" }}>
          {expanded ? "최근 4건만 보기" : `불러온 메모 ${notes.length}건 모두 보기`}
        </button>
      )}
    </section>
  );
}

export function ProjectDetailPanel({
  project, container, todos = [], updates = [], content = [], decisions = [], notes = [],
  notesPartial = false, checks = [], syncState, failedSources = [], updateTone = {}, checkTone = {},
  contentTone = {}, orderPending = false, orderResult = null, pendingTodoIds = new Set(),
  taskPartial = false, onClose, onEdit, onToggleTodo, onEditTodo, onCreateTodo, onOpen,
  onSendOrder, onConsultCouncil, onComplete, onManageDelivery, onArchive,
  onCustomerSaved, onMemo, onOpenMemo,
}) {
  const [tab, setTab] = React.useState('tasks');
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const customerButton = React.useRef(null);
  const mainBody = React.useRef(null), savedScroll = React.useRef(0);
  if (!project) return null;
  const doneCount = todos.filter(todo => todo.done).length;
  const failed = new Set(failedSources);
  const displaySummary = project.displaySummary || project.summary || '';
  const displayNextAction = project.displayNextAction || project.nextAction || '';
  const customer = projectCustomerRef(project.entityRef);
  const failedEmpty = (source, empty) => failed.has(source) ? '이 기록을 읽지 못했어요. 다시 확인해 주세요.' : empty;
  const backToProject = () => {
    setCustomerOpen(false);
    requestAnimationFrame(() => {
      if (mainBody.current) mainBody.current.scrollTop = savedScroll.current;
      customerButton.current?.focus({ preventScroll: true });
    });
  };

  return <aside className="hub-project-detail-panel project-focus" aria-label={`${project.name} 상세`}>
    <div className="project-focus-top">
      <BrandMark brand={container} size={20} />
      <span className="project-focus-muted project-focus-container">{container?.name || '저장 위치 미정'}</span>
      <IconButton icon="x" size={24} tooltip="상세 닫기" onClick={onClose} />
    </div>
    <div ref={mainBody} hidden={customerOpen} className="hub-project-detail-body scroll-y project-focus-body">
      <header className="project-focus-stack">
        <h3 className="project-focus-heading">{project.name}</h3>
        <div className="project-focus-actions">
          <ProjectStatusBadge status={project.status} />
          <span className="mono project-focus-muted">{project.due || '기한 없음'}</span>
        </div>
        <div className="project-focus-customers">
          <span className="project-focus-muted">관련 고객</span>
          <Button ref={customerButton} variant="outline" size="sm" onClick={() => { savedScroll.current = mainBody.current?.scrollTop || 0; setCustomerOpen(true); }}>
            {customer ? project.entityLabel || '연결된 고객 보기' : '+ 고객 연결'}
          </Button>
        </div>
      </header>
      {displayNextAction && <section className="project-focus-next">
        <h4>다음 행동</h4><p>{displayNextAction}</p>
      </section>}
      {failedSources.length > 0 && <div role="status"><TruthBadge state="partial" /><p className="project-focus-muted">일부 기록을 확인하지 못했어요.</p></div>}
      <SegmentedControl label="프로젝트 상세 보기" value={tab} onChange={setTab} options={[
        { key: 'tasks', label: '할 일' }, { key: 'records', label: '기록·자료' },
      ]} />
      <div hidden={tab !== 'tasks'} className="project-focus-stack">
        <div className="project-focus-actions">
          <h4>할 일</h4><span className="mono project-focus-muted">{doneCount}/{todos.length} 완료{taskPartial ? ' · 확인된 범위' : ''}</span>
        </div>
        {todos.map(todo => <div key={todo.id} className="project-focus-task">
          <Checkbox checked={todo.done} onChange={() => onToggleTodo?.(todo.id)} disabled={pendingTodoIds.has(todo.id)} size={16} label={`${todo.done ? '다시 열기' : '완료'}: ${todo.title}`} />
          <div className="project-focus-task-copy"><button className="hub-pms-task-main" onClick={() => onEditTodo?.(todo)}>
            <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.title}</span>
            {todo.nextAction && <span className="hub-pms-task-next">{todo.nextAction}</span>}
          </button><TaskChecklistGauge task={todo} /></div>
          <span className="mono project-focus-muted">{todo.due}</span>
        </div>)}
        {!todos.length && <p className="project-focus-muted">{taskPartial ? '할 일을 모두 확인하지 못했어요.' : '할 일을 추가해 다음 행동을 이어가세요.'}</p>}
        <Button variant="primary" icon="plus" onClick={() => onCreateTodo?.(project.id)}>할 일 추가</Button>
        <details className="project-focus-details"><summary>목표·프로젝트 정보</summary><div className="project-focus-stack">
          <section><h4>목표 결과</h4><p>{displaySummary || '아직 목표 결과를 정하지 않았어요.'}</p></section>
          <ProjectProgressGauge progress={project.displayProgress} ariaLabel={`${project.name} 진척`} />
          <p className="project-focus-muted">{progressLabel(project)}</p>
          <dl className="project-focus-properties"><dt>담당</dt><dd>{project.owner}</dd>
            <dt>최근 활동</dt><dd>{project.lastActivityLabel || '미정'}{project.updateEvidencePartial ? ' · 일부 미확인' : ''}</dd>
            <dt>생성</dt><dd>{project.createdAtLabel || '미정'}</dd></dl>
          {project.originDealId && <a className="hub-row project-focus-link" href={`/dashboard/revenue/deals?deal=${encodeURIComponent(project.originDealId)}`}>원본 거래 보기 →</a>}
          <ProjectDeliverySummary project={project} onManage={onManageDelivery} compact />
          <GoalLinks entityType="projects" entityId={project.id} scope={project.orgScope || project.tag} />
        </div></details>
      </div>
      <div hidden={tab !== 'records'} className="project-focus-stack">
        <Button variant="primary" onClick={() => onMemo?.(projectMemoContexts(project))}>프로젝트 메모 남기기</Button>
        {tab === 'records' && <RelatedMemos type="project" id={project.id} onOpen={onOpenMemo} />}
        <details className="project-focus-details"><summary>업데이트·결정·연관 자료</summary><div className="project-focus-stack">
          <DetailSection title="최근 업데이트" count={updates.length} empty={failedEmpty('project_updates', '최근 업데이트가 없어요.')}>
            {updates.map(update => <ActivityRow key={update.id} title={update.title} body={update.summary || update.nextAction} meta={update.happenedAtLabel} badge={update.source} tone={updateTone[update.status] || 'neutral'} />)}
          </DetailSection>
          <DetailSection title="결정" count={decisions.length} empty={failedEmpty('decisions', '결정 기록이 없어요.')}>
            {decisions.map(decision => <ActivityRow key={decision.id} title={decision.title} body={decision.summary} meta={decision.decidedAtLabel} badge="결정" />)}
          </DetailSection>
          <DetailSection title="연관 콘텐츠" count={content.length} empty="연관 콘텐츠가 없어요.">
            {content.map(item => <ActivityRow key={item.id} title={item.title} body={[item.kind, item.channel].filter(Boolean).join(' · ')} meta={item.when} badge={item.statusLabel} tone={contentTone[item.status] || 'neutral'} />)}
          </DetailSection>
          <ProjectNotes key={project.id} notes={notes} partial={notesPartial} failed={failed.has('notes')} />
          <a className="hub-row project-focus-link" href={`/dashboard/work/projects?view=memos&project=${encodeURIComponent(project.id)}`}>메모 작업대 · 업무에 연결 →</a>
          <DetailSection title="루틴 체크" count={checks.length} empty={failedEmpty('routine_checks', '루틴 체크가 없어요.')}>
            {checks.map(check => <ActivityRow key={check.id} title={check.checkType} body={check.note} meta={check.checkedAtLabel} badge={check.status} tone={checkTone[check.status] || 'neutral'} />)}
          </DetailSection>
        </div></details>
      </div>
    </div>
    {customerOpen && <div className="hub-project-detail-body scroll-y project-focus-body">
      <ProjectCustomerPanel project={project} onBack={backToProject} onSaved={onCustomerSaved} onMemo={onMemo} onOpenMemo={onOpenMemo} />
    </div>}
    <div hidden={customerOpen} className="hub-project-detail-actions project-focus-footer">
      <div className="project-focus-actions">
        <Button variant="ghost" size="sm" onClick={() => onEdit?.(project)}>프로젝트 편집</Button>
        <Button variant="outline" size="sm" onClick={() => onOpen?.(project)}>작업 관리</Button>
      </div>
      <details className="project-focus-details"><summary>더 보기</summary><div className="project-focus-actions">
        <Button variant="ghost" size="sm" onClick={() => onComplete?.(project)}>{project.statusKey === 'completed' ? '다시 열기' : '완료'}</Button>
        <Button variant="ghost" size="sm" onClick={() => onArchive?.(project)}>{project.statusKey === 'archived' ? '보관 해제' : '보관'}</Button>
        <Button variant="ghost" size="sm" onClick={() => onConsultCouncil?.(project)}>Council 조언</Button>
        <Button variant="ghost" size="sm" disabled={orderPending} onClick={() => onSendOrder?.(project)}>{orderPending ? '전송 중…' : '주문 보내기'}</Button>
      </div></details>
      {orderResult && !orderPending && <p role={orderResult.tone === 'ok' ? 'status' : 'alert'} className={orderResult.tone === 'ok' ? 'project-focus-muted' : 'project-focus-error'}>{orderResult.label}</p>}
    </div>
  </aside>;
}
