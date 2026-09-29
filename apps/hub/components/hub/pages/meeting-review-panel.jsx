"use client";

import React from 'react';
import Link from 'next/link';
import { Button, CertaintyBadge, LifecycleBadge, SegmentedControl, Skeleton, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import './meeting-review-panel.css';

const KIND_LABEL = {
  summary: '요약',
  decision: '결정',
  open_issue: '미결',
  value: '수치·조건',
  concern: '고객 우려',
  signal: '고객 신호',
  action: '다음 행동',
};

const CERTAINTY_LABEL = {
  stated: '원문 진술',
  derived: 'AI 해석',
  unknown: '확인 필요',
};

const RUN_ERROR_COPY = {
  'provider-unavailable': 'AI 분석 서비스에 연결하지 못했어요. 잠시 뒤 다시 실행해 주세요.',
  'provider-error': 'AI 분석 서비스가 요청을 처리하지 못했어요. 잠시 뒤 다시 실행해 주세요.',
  'analysis-failed': '분석 결과를 만들지 못했어요. 저장된 원문을 확인하고 다시 실행해 주세요.',
};

const ACTION_SCOPES = [
  { key: 'mine', label: '내가 할 일' },
  { key: 'related', label: '함께 신경 쓸 일' },
  { key: 'unknown', label: '담당 확인 필요' },
];

const DATE_ROLES = { deadline: '기한 언급', scheduled: '예정일 언급', reference: '참고 날짜' };

function displayDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '실제 날짜 미정';
  const [year, month, day] = value.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function actionScopeOf(proposal) {
  const scope = proposal.review?.execution?.actionScope || proposal.actionScope;
  return ACTION_SCOPES.some((item) => item.key === scope) ? scope : 'unknown';
}

function initialExecution(proposal) {
  const saved = proposal.review?.execution;
  if (saved) return {
    actionScope: actionScopeOf(proposal),
    dueAt: typeof saved.dueAt === 'string' ? saved.dueAt : null,
    method: typeof saved.method === 'string' ? saved.method : '',
    checklist: Array.isArray(saved.checklist) ? saved.checklist.map((item) => ({
      id: item.id, title: item.title || '', done: item.done === true,
      note: item.note || '', ...(item.dueAt ? { dueAt: item.dueAt } : {}),
    })) : [],
  };
  return {
    actionScope: actionScopeOf(proposal),
    dueAt: null,
    method: typeof proposal.methodQuote === 'string' ? proposal.methodQuote : '',
    checklist: Array.isArray(proposal.checklist) ? proposal.checklist.map((item) => ({
      id: crypto.randomUUID(), title: item.quote || '', done: false, note: '',
    })) : [],
  };
}

function executionForSave(execution) {
  return {
    actionScope: execution.actionScope,
    dueAt: execution.dueAt || null,
    method: execution.method.trim() || null,
    checklist: execution.checklist.map((item) => ({
      id: item.id, title: item.title.trim(), done: false,
      note: item.note || '', ...(item.dueAt ? { dueAt: item.dueAt } : {}),
    })),
  };
}

function sourcePosition(source, body) {
  const start = source?.start;
  const end = source?.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > body.length) return null;
  const quote = body.slice(start, end);
  return quote === source.quote ? { start, end, quote } : null;
}

function SourceExcerpt({ body, source, compact = false, wholeSource = false }) {
  if (wholeSource) return <p className="meeting-review__source-missing">여러 구간 요약 · 원문 전체를 확인해 주세요.</p>;
  const position = sourcePosition(source, body);
  if (!position) return <p className="meeting-review__source-missing">원문에서 인용 위치를 확인할 수 없어요. 이 후보는 확정할 수 없습니다.</p>;
  const context = compact ? 58 : 110;
  const beforeStart = Math.max(0, position.start - context);
  const afterEnd = Math.min(body.length, position.end + context);
  return <blockquote className="meeting-review__excerpt">
    {beforeStart > 0 && <span aria-hidden="true">…</span>}
    {body.slice(beforeStart, position.start)}
    <mark>{position.quote}</mark>
    {body.slice(position.end, afterEnd)}
    {afterEnd < body.length && <span aria-hidden="true">…</span>}
  </blockquote>;
}

function UsageNote({ usage }) {
  const values = [
    ['입력', usage?.promptTokens],
    ['출력', usage?.candidatesTokens],
    ['합계', usage?.totalTokens],
  ].filter(([, value]) => Number.isSafeInteger(value) && value >= 0);
  if (usage?.status !== 'known' || values.length === 0) return <p className="meeting-review__usage">사용량 확인 불가</p>;
  return <p className="meeting-review__usage">AI 사용량 · {values.map(([label, value], index) => <React.Fragment key={label}>
    {index > 0 && ' · '}{label} <span className="mono">{value.toLocaleString('ko-KR')}</span>
  </React.Fragment>)} 토큰</p>;
}

function ActionExecutionFields({ proposal, body, execution, setExecution, disabled, invalidChecklist }) {
  const update = (patch) => setExecution((previous) => ({ ...previous, ...patch }));
  const updateStep = (id, title) => setExecution((previous) => ({
    ...previous, checklist: previous.checklist.map((item) => item.id === id ? { ...item, title } : item),
  }));
  const removeStep = (id) => setExecution((previous) => ({
    ...previous, checklist: previous.checklist.filter((item) => item.id !== id),
  }));
  const dateMentions = Array.isArray(proposal.dateMentions) ? proposal.dateMentions : [];
  const suggestedSteps = Array.isArray(proposal.checklist) ? proposal.checklist : [];
  const relation = sourcePosition(proposal.relation, body);
  const dateLabel = execution.actionScope === 'mine' ? '할 일 기한' : execution.actionScope === 'related' ? '다시 살펴볼 날짜' : '확인한 날짜';

  return <div className="meeting-review__execution-fields">
    <div className="meeting-review__field-group">
      <strong>이 일과 나의 관계</strong>
      <fieldset className="meeting-review__scope-fieldset" disabled={disabled}>
        <SegmentedControl className="meeting-review__scope-switch" label="이 일과 나의 관계 확인"
          options={ACTION_SCOPES} value={execution.actionScope} onChange={(actionScope) => update({ actionScope })} />
      </fieldset>
      <p className="meeting-review__field-hint">AI 분류는 제안입니다. 화자가 분명하지 않으면 담당 확인 필요로 두세요.</p>
      {relation && <div className="meeting-review__supporting-source">
        <span className="meeting-review__eyebrow">담당·영향 판단의 원문 근거</span>
        <SourceExcerpt body={body} source={proposal.relation} compact />
      </div>}
    </div>

    <div className="meeting-review__field-group">
      <strong>언제 · 어떻게</strong>
      {dateMentions.length ? <ul className="meeting-review__date-mentions">{dateMentions.map((mention, index) => <li key={`${mention.start ?? index}-${mention.quote}`}>
        <span>{DATE_ROLES[mention.role] || '날짜 언급'}</span>
        {sourcePosition(mention, body) ? <><q>{mention.quote}</q><span>{displayDate(mention.date)}</span></>
          : <span>원문 근거 위치 확인 필요</span>}
      </li>)}</ul> : <p className="meeting-review__field-hint">원문에서 날짜를 찾지 못했어요.</p>}
      <TextField label={dateLabel} type="date" value={execution.dueAt || ''} disabled={disabled}
        onChange={(event) => update({ dueAt: event.target.value || null })}
        hint="원문 날짜 후보는 자동 입력되지 않습니다. 실제 기한이나 점검일을 확인한 뒤 선택하세요." />
      {proposal.methodQuote && <p className="meeting-review__method-source">원문 실행 방식 · <q>{proposal.methodQuote}</q></p>}
      <TextAreaField label="구체적인 실행 방법" value={execution.method} rows={2} maxLength={1000} showCount disabled={disabled}
        onChange={(event) => update({ method: event.target.value })}
        hint="연락 채널·준비물·산출물처럼 실제로 어떻게 진행할지 적으세요. 미정이면 비워 두세요." />
    </div>

    <div className="meeting-review__field-group">
      <div className="meeting-review__checklist-head"><strong>진행 체크리스트</strong><span className="num">{execution.checklist.length}/50</span></div>
      {suggestedSteps.length > 0 && <div className="meeting-review__step-sources">
        <span className="meeting-review__eyebrow">원문에서 제안된 순서</span>
        <ol>{suggestedSteps.map((item, index) => <li key={`${item.start ?? index}-${item.quote}`}>
          {sourcePosition(item, body) ? <q>{item.quote}</q> : <span>근거 위치 확인 필요</span>}
        </li>)}</ol>
      </div>}
      {execution.checklist.length === 0 && <p className="meeting-review__field-hint">아직 단계가 없습니다. 필요한 행동을 직접 추가할 수 있어요.</p>}
      <ol className="meeting-review__steps">{execution.checklist.map((item, index) => <li key={item.id}>
        <TextField label={`단계 ${index + 1}`} value={item.title} maxLength={200} disabled={disabled}
          onChange={(event) => updateStep(item.id, event.target.value)} placeholder="실행할 세부 행동" />
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => removeStep(item.id)} aria-label={`${index + 1}번째 단계 삭제`}>삭제</Button>
      </li>)}</ol>
      {invalidChecklist && <p className="meeting-review__local-error" role="status">빈 단계는 내용을 적거나 삭제해 주세요.</p>}
      <Button type="button" variant="outline" size="sm" disabled={disabled || execution.checklist.length >= 50}
        onClick={() => setExecution((previous) => ({ ...previous, checklist: [...previous.checklist,
          { id: crypto.randomUUID(), title: '', done: false, note: '' },
        ] }))}>단계 추가</Button>
      <p className="meeting-review__field-hint">검토 저장 후 내 할 일로 등록한 단계는 할 일에서 완료 표시할 수 있습니다.</p>
    </div>
  </div>;
}

function Candidate({ proposal, body, disabled, busy, selected, onSelect, onReview, onApplyTask, onRetry }) {
  const review = proposal.review || {};
  const reviewStatus = ['accepted', 'rejected'].includes(review.status) ? review.status : 'pending';
  const saved = proposal.application?.status === 'saved';
  const targetId = proposal.application?.targetId;
  const targetHref = typeof proposal.application?.href === 'string' && proposal.application.href.startsWith('/dashboard/') ? proposal.application.href : null;
  const applicationUncertain = proposal.application && !['none', 'saved'].includes(proposal.application.status);
  const persistedText = typeof review.text === 'string' && review.text ? review.text : proposal.text || '';
  const persistedExecutionKey = JSON.stringify(review.execution ?? null);
  const [editedText, setEditedText] = React.useState(persistedText);
  const [execution, setExecution] = React.useState(() => initialExecution(proposal));
  const [pending, setPending] = React.useState('');
  const [localError, setLocalError] = React.useState('');
  const pendingRef = React.useRef(false);
  const evidenceId = React.useId();
  const wholeSource = proposal.kind === 'summary';
  const grounded = wholeSource ? Boolean(body.trim()) : Boolean(sourcePosition(proposal.source, body));
  const locked = disabled || busy || Boolean(pending) || saved || applicationUncertain;
  const isAction = proposal.kind === 'action';
  const checklistInvalid = isAction && (execution.checklist.length > 50 || execution.checklist.some((item) => !item.title.trim() || item.title.length > 200));
  const executionChanged = isAction && (!review.execution || JSON.stringify(executionForSave(execution)) !== JSON.stringify(executionForSave(initialExecution(proposal))));
  const unsavedEdit = editedText !== persistedText || (reviewStatus === 'accepted' && executionChanged);
  const canAccept = !locked && grounded && editedText.trim().length > 0 && !checklistInvalid && execution.method.length <= 1000 && Boolean(onReview);
  const canApply = !locked && !unsavedEdit && grounded && reviewStatus === 'accepted' && isAction
    && review.execution?.actionScope === 'mine' && !applicationUncertain && Boolean(onApplyTask);
  const kindLabel = KIND_LABEL[proposal.kind] || '기타';
  const certainty = wholeSource ? 'derived' : CERTAINTY_LABEL[proposal.certainty] ? proposal.certainty : 'unknown';

  React.useEffect(() => {
    setEditedText(persistedText);
    setExecution(initialExecution(proposal));
  // A sibling review refreshes every proposal object. Preserve this card's
  // in-progress plan unless its own saved review actually changed.
  }, [persistedText, proposal.id, persistedExecutionKey, reviewStatus]);

  const submitReview = async (decision) => {
    if (pendingRef.current || locked || (decision === 'accepted' && !canAccept)) return;
    const previousScope = review.execution?.actionScope || proposal.actionScope;
    const previousTitle = review.execution?.actionScope === 'related' ? persistedText : proposal.text || '';
    if (decision === 'accepted' && isAction && previousScope === 'related'
      && execution.actionScope === 'mine' && editedText.trim() === previousTitle.trim()) {
      setLocalError('관련된 일을 내 할 일로 바꾸려면 실제로 내가 할 행동 문장도 고쳐 주세요.');
      return;
    }
    pendingRef.current = true;
    setLocalError('');
    setPending(decision);
    try { await onReview?.(proposal.id, { decision, editedText: editedText.trim(), execution: decision === 'accepted' && isAction ? executionForSave(execution) : null }); }
    catch (cause) { setLocalError(cause?.message || '검토 결과를 저장하지 못했어요. 다시 확인해 주세요.'); }
    finally { pendingRef.current = false; setPending(''); }
  };

  const applyTask = async () => {
    if (pendingRef.current || !canApply) return;
    pendingRef.current = true;
    setLocalError('');
    setPending('apply');
    try { await onApplyTask?.(proposal.id); }
    catch (cause) { setLocalError(cause?.message || '할 일 등록 결과를 확인하지 못했어요. 다시 확인해 주세요.'); }
    finally { pendingRef.current = false; setPending(''); }
  };

  return <li className="meeting-review__candidate" data-review={reviewStatus} data-selected={selected ? 'true' : undefined}>
    <div className="meeting-review__candidate-head">
      <div className="meeting-review__candidate-labels">
        <span className="meeting-review__kind">{kindLabel}</span>
        <CertaintyBadge state={certainty === 'unknown' ? 'unknown' : reviewStatus === 'accepted' && certainty === 'stated' ? 'confirmed' : 'recommended'}
          label={CERTAINTY_LABEL[certainty]} />
        <LifecycleBadge state={reviewStatus === 'accepted' ? 'done' : reviewStatus === 'rejected' ? 'cancelled' : 'queued'}
          label={reviewStatus === 'accepted' ? '확인됨' : reviewStatus === 'rejected' ? '제외됨' : '검토 전'} />
      </div>
      {!wholeSource && <Button type="button" variant="ghost" size="xs" onClick={() => onSelect(selected ? null : proposal.id)} aria-expanded={selected} aria-controls={evidenceId}>
        {selected ? '문맥 접기' : '문맥 더 보기'}
      </Button>}
    </div>

    <TextAreaField label={`${kindLabel} 후보 문장`} value={editedText} rows={3}
      maxLength={proposal.kind === 'action' ? 200 : 4000} showCount
      disabled={locked} onChange={(event) => setEditedText(event.target.value)}
      hint={reviewStatus === 'accepted' ? '확인한 문장입니다. 할 일은 별도 등록해야 저장됩니다.' : wholeSource ? '요약은 여러 구간을 합친 AI 해석입니다. 원문 전체를 읽고 확인해 주세요.' : '원문을 대조하고 필요한 표현을 고쳐 주세요.'} />

    <div className="meeting-review__candidate-evidence" id={evidenceId}>
      <span className="meeting-review__eyebrow">{wholeSource ? '원문 전체' : `원문 근거 · 문자 ${grounded ? `${proposal.source.start + 1}–${proposal.source.end}` : '확인 불가'}`}</span>
      <SourceExcerpt body={body} source={proposal.source} compact={!selected} wholeSource={wholeSource} />
    </div>

    {isAction && <div className="meeting-review__plan">
      <div className="meeting-review__plan-snapshot" aria-label="실행 계획 요약">
        <span>{reviewStatus === 'accepted' ? '확인한 관계' : '관계 후보'} · {ACTION_SCOPES.find((item) => item.key === execution.actionScope)?.label || '담당 확인 필요'}</span>
        <span>{execution.actionScope === 'related' ? '점검일' : '기한'} · {execution.dueAt ? displayDate(execution.dueAt) : '미정'}</span>
        <span>방법 · {execution.method.trim() ? '작성됨' : '미정'}</span>
        <span>단계 · <span className="num">{execution.checklist.length}</span>개</span>
      </div>
      <details className="meeting-review__plan-detail">
        <summary>담당·날짜·방법·체크리스트 확인 및 편집</summary>
        <ActionExecutionFields proposal={proposal} body={body} execution={execution} setExecution={setExecution}
          disabled={locked} invalidChecklist={checklistInvalid} />
      </details>
    </div>}
    {isAction && reviewStatus === 'accepted' && review.execution?.actionScope !== 'mine'
      && <p className="meeting-review__unknown">{review.execution?.actionScope === 'related'
        ? '함께 신경 쓸 일로 확인했습니다. 내 할 일로 바꾸려면 실제 행동 문장을 고쳐 다시 확인하세요.'
        : '실제 담당이 미정입니다. 내 할 일로 확정하기 전에는 할 일을 만들지 않습니다.'}</p>}
    {unsavedEdit && reviewStatus === 'accepted' && <p className="meeting-review__disabled-note">
      {isAction ? '수정한 행동·날짜·방법·단계를 다시 저장해야 할 일에 반영할 수 있어요.' : '수정한 문장을 다시 저장해 주세요.'}
    </p>}
    {saved && <div className="meeting-review__receipt" role="status"><LifecycleBadge state="done" label="할 일 저장됨" />
      {targetHref && <Link href={targetHref} className="meeting-review__target-link hub-row">만든 할 일 열기 →</Link>}
      {targetId && !targetHref && <span className="mono">ID {targetId}</span>}
    </div>}
    {applicationUncertain && <div className="meeting-review__receipt" role="status"><TruthBadge state="partial" label="저장 결과 확인 필요" />
      <span>중복 등록을 막기 위해 결과를 확인한 뒤 다시 시도하세요.</span>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={busy}>결과 다시 확인</Button>}
    </div>}
    {localError && <p className="meeting-review__local-error" role="alert">{localError}</p>}
    <div className="meeting-review__candidate-actions">
      <Button type="button" variant="outline" disabled={!canAccept || (reviewStatus === 'accepted' && !unsavedEdit)} onClick={() => submitReview('accepted')}>
        {pending === 'accepted' ? '확인 저장 중…' : reviewStatus === 'accepted' ? unsavedEdit ? '수정 저장' : '확인됨' : '검토 후 확인'}
      </Button>
      <Button type="button" variant="ghost" disabled={locked || reviewStatus === 'rejected' || !onReview} onClick={() => submitReview('rejected')}>
        {pending === 'rejected' ? '제외 저장 중…' : reviewStatus === 'rejected' ? '제외됨' : '제외'}
      </Button>
      {isAction && reviewStatus === 'accepted' && review.execution?.actionScope === 'mine'
        && <Button type="button" variant="outline" disabled={!canApply || saved} onClick={applyTask}>
        {saved ? '할 일 등록됨' : pending === 'apply' ? '등록 중…' : '할 일 등록'}
      </Button>}
    </div>
  </li>;
}

export function MeetingReviewPanel({ entry, status = 'idle', proposals = [], run = null, usage = null, busy = false, error = '', disabledReason = null, onAnalyze, onReview, onApplyTask, onRetry }) {
  const body = typeof entry?.body === 'string' ? entry.body : '';
  const [selectedId, setSelectedId] = React.useState(null);
  const [applying, setApplying] = React.useState(false);
  const applyLock = React.useRef(false);
  const working = Boolean(busy) || applying;
  const sourceChanged = Boolean(run?.stale || (run?.sourceRevision != null && entry?.revision != null && String(run.sourceRevision) !== String(entry.revision)));
  const blockedReason = disabledReason || (sourceChanged ? '분석 때의 원문과 현재 저장본이 달라요. 저장본을 확인한 뒤 다시 분석해 주세요.' : null);
  const canAnalyze = status === 'live' && !disabledReason && !working && Boolean(entry?.id) && body.trim().length > 0;
  const canReview = canAnalyze && !sourceChanged;
  const ready = status === 'live' && run?.state === 'ready';
  const visibleProposals = ready && Array.isArray(proposals) ? proposals : [];
  const actionProposals = visibleProposals.filter((item) => item.kind === 'action');
  const recordProposals = visibleProposals.filter((item) => item.kind !== 'action');
  const actionGroups = ACTION_SCOPES.map((scope) => ({ ...scope,
    proposals: actionProposals.filter((item) => actionScopeOf(item) === scope.key),
  }));
  const datesMentioned = actionProposals.filter((item) => Array.isArray(item.dateMentions) && item.dateMentions.length > 0).length;
  const stepSuggestions = actionProposals.reduce((count, item) => count + (Array.isArray(item.checklist) ? item.checklist.length : 0), 0);
  const failure = typeof error === 'string' ? error : error?.message || '';
  const runFailure = RUN_ERROR_COPY[run?.error] || '분석 결과를 만들지 못했어요. 저장된 원문을 확인하고 다시 실행해 주세요.';

  const applyOneTask = async (proposalId) => {
    if (applyLock.current || !canReview) return;
    applyLock.current = true;
    setApplying(true);
    try { await onApplyTask?.(proposalId); }
    finally { applyLock.current = false; setApplying(false); }
  };

  return <section className="meeting-review" aria-labelledby="meeting-review-title">
    <div className="meeting-review__head">
      <div>
        <h3 id="meeting-review-title">회의 내용 검토</h3>
        <p>원문을 먼저 저장하고, 필요할 때만 AI 분석을 실행합니다. 후보는 검토 전까지 어떤 곳에도 반영되지 않습니다.</p>
      </div>
      <div className="meeting-review__head-actions">
        {status === 'live' && <TruthBadge state="live" label="저장본 연결됨" />}
        {status === 'preview' && <TruthBadge state="preview" />}
        {status === 'error' && <TruthBadge state="error" label="검토 정보 읽기 실패" />}
        {working && <TruthBadge state="syncing" label="요청 처리 중" />}
        <Button type="button" variant="outline" disabled={!canAnalyze || run?.state === 'generating' || !onAnalyze} onClick={onAnalyze}>
          {working ? '처리 중…' : run?.state === 'unknown' ? '새 분석 실행 · 추가 비용 가능' : run?.state === 'ready' ? '다시 분석' : run?.state === 'error' ? '분석 다시 시도' : 'AI 분석 실행'}
        </Button>
      </div>
    </div>

    {blockedReason && <p className="meeting-review__blocked" role="status">{blockedReason}</p>}

    {status === 'idle' || status === 'loading' ? <Skeleton lines={3} height={16} gap={10} label="회의 검토 정보 불러오는 중" /> : null}

    {status === 'preview' && <div className="meeting-review__message" role="status">
      <p>저장소가 연결되지 않아 분석·검토 결과를 확인할 수 없어요. 원문은 위에서 확인하세요.</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={working}>연결 다시 확인</Button>}
    </div>}
    {status === 'error' && <div className="meeting-review__message meeting-review__message--error" role="alert">
      <p>{failure || '검토 정보를 불러오지 못했어요. 원문은 그대로 두고 다시 확인해 주세요.'}</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={working}>다시 불러오기</Button>}
    </div>}
    {status === 'live' && failure && <div className="meeting-review__message meeting-review__message--error" role="alert">
      <p>{failure}</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={working}>저장된 결과 다시 확인</Button>}
    </div>}

    {status === 'live' && run?.state === 'generating' && <div className="meeting-review__message" role="status">
      <TruthBadge state="loading" label="분석 중" />
      <p>원문은 저장돼 있습니다. 분석이 끝나면 검토 후보가 나타납니다.</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={working}>결과 확인</Button>}
    </div>}
    {status === 'live' && run?.state === 'unknown' && <div className="meeting-review__message" role="status">
      <TruthBadge state="partial" label="이전 분석 결과 미확인" />
      <p>이전 요청이 완료됐는지 확인하지 못했어요. 새 분석은 별도 요청으로 비용이 다시 발생할 수 있습니다.</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry} disabled={working}>이전 요청 결과 확인</Button>}
    </div>}
    {status === 'live' && run?.state === 'error' && <div className="meeting-review__message meeting-review__message--error" role="alert">
      <TruthBadge state="error" label="분석 실패" />
      <p>{runFailure}</p>
    </div>}

    {status === 'live' && !run && <div className="meeting-review__message" role="status">
      <p>분석한 기록이 없습니다. 저장된 원문을 검토한 뒤 필요하면 분석을 실행하세요.</p>
    </div>}

    {ready && <div className="meeting-review__layout">
      <div className="meeting-review__overview" aria-label="실행 후보 개요">
        <div><strong>회의 후 진행할 일</strong><p>담당·날짜·방법·단계는 AI 제안입니다. 확인한 것만 저장하거나 할 일로 연결하세요.</p></div>
        <dl>
          <div><dt>내가 할 일 후보</dt><dd className="stat">{actionGroups[0].proposals.length}</dd></div>
          <div><dt>함께 신경 쓸 일 후보</dt><dd className="stat">{actionGroups[1].proposals.length}</dd></div>
          <div><dt>날짜 언급 후보</dt><dd className="stat">{datesMentioned}</dd></div>
          <div><dt>체크리스트 단계 후보</dt><dd className="stat">{stepSuggestions}</dd></div>
        </dl>
        {actionGroups[2].proposals.length > 0 && <p className="meeting-review__unassigned" role="status">
          담당 확인 필요 <span className="num">{actionGroups[2].proposals.length}개</span> · 먼저 내가 할 일인지, 함께 살필 일인지 확인하세요.
        </p>}
      </div>
      <div className="meeting-review__results">
        <div className="meeting-review__results-head"><strong>검토 후보</strong><span className="num">{visibleProposals.length}개</span></div>
        <UsageNote usage={usage} />
        {visibleProposals.length === 0 && <p className="meeting-review__message">이번 분석에서 후보를 찾지 못했어요. 원문은 보존돼 있습니다.</p>}
        {actionGroups.filter((group) => group.proposals.length > 0).map((group) => <section className="meeting-review__group" key={group.key}
          aria-labelledby={`meeting-review-group-${group.key}`}>
          <div className="meeting-review__group-head"><h4 id={`meeting-review-group-${group.key}`}>{group.label} 후보</h4><span className="num">{group.proposals.length}개</span></div>
          <p>{group.key === 'mine' ? '실제 내 담당인지 확인하고, 실행 방법·기한·단계를 다듬으세요.'
            : group.key === 'related' ? '내가 직접 처리할 일과 구분해 점검할 날짜와 방법을 정하세요.'
              : '화자나 담당이 불명확합니다. 관계를 확인하기 전에는 할 일로 등록하지 않습니다.'}</p>
          <ul className="meeting-review__candidates">{group.proposals.map((proposal) => <Candidate
            key={proposal.id} proposal={proposal} body={body} selected={selectedId === proposal.id}
            disabled={!canReview} busy={working} onSelect={setSelectedId}
            onReview={onReview} onApplyTask={applyOneTask} onRetry={onRetry} />)}</ul>
        </section>)}
        {recordProposals.length > 0 && <section className="meeting-review__group" aria-labelledby="meeting-review-group-record">
          <div className="meeting-review__group-head"><h4 id="meeting-review-group-record">결정·미결·기타 기록</h4><span className="num">{recordProposals.length}개</span></div>
          <p>회의에서 확인할 사실과 맥락입니다. 검토만으로 할 일이나 외부 기록이 생성되지는 않습니다.</p>
          <ul className="meeting-review__candidates">{recordProposals.map((proposal) => <Candidate
            key={proposal.id} proposal={proposal} body={body} selected={selectedId === proposal.id}
            disabled={!canReview} busy={working} onSelect={setSelectedId}
            onReview={onReview} onApplyTask={applyOneTask} onRetry={onRetry} />)}</ul>
        </section>}
      </div>
      <details className="meeting-review__source" aria-label="저장된 회의 원문">
        <summary className="meeting-review__source-head"><strong>저장된 원문 전체 보기</strong><span className="mono">v{entry?.revision ?? '—'}</span></summary>
        <pre className="meeting-review__source-body">{body}</pre>
      </details>
    </div>}
  </section>;
}
