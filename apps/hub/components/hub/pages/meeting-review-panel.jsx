"use client";

import React from 'react';
import Link from 'next/link';
import { Button, CertaintyBadge, LifecycleBadge, Skeleton, TextAreaField, TruthBadge } from '../hub-primitives';
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

function Candidate({ proposal, body, disabled, busy, selected, onSelect, onReview, onApplyTask, onRetry }) {
  const review = proposal.review || {};
  const reviewStatus = ['accepted', 'rejected'].includes(review.status) ? review.status : 'pending';
  const saved = proposal.application?.status === 'saved';
  const targetId = proposal.application?.targetId;
  const targetHref = typeof proposal.application?.href === 'string' && proposal.application.href.startsWith('/dashboard/') ? proposal.application.href : null;
  const applicationUncertain = proposal.application && !['none', 'saved'].includes(proposal.application.status);
  const persistedText = typeof review.text === 'string' && review.text ? review.text : proposal.text || '';
  const [editedText, setEditedText] = React.useState(persistedText);
  const [pending, setPending] = React.useState('');
  const [localError, setLocalError] = React.useState('');
  const pendingRef = React.useRef(false);
  const evidenceId = React.useId();
  const wholeSource = proposal.kind === 'summary';
  const grounded = wholeSource ? Boolean(body.trim()) : Boolean(sourcePosition(proposal.source, body));
  const locked = disabled || busy || Boolean(pending) || saved || applicationUncertain;
  const canAccept = !locked && grounded && editedText.trim().length > 0 && Boolean(onReview);
  const unsavedEdit = editedText !== persistedText;
  const canApply = !locked && !unsavedEdit && grounded && reviewStatus === 'accepted' && proposal.kind === 'action' && !applicationUncertain && Boolean(onApplyTask);
  const kindLabel = KIND_LABEL[proposal.kind] || '기타';
  const certainty = wholeSource ? 'derived' : CERTAINTY_LABEL[proposal.certainty] ? proposal.certainty : 'unknown';

  React.useEffect(() => { setEditedText(persistedText); }, [persistedText, proposal.id]);

  const submitReview = async (decision) => {
    if (pendingRef.current || locked || (decision === 'accepted' && !canAccept)) return;
    pendingRef.current = true;
    setLocalError('');
    setPending(decision);
    try { await onReview?.(proposal.id, { decision, editedText: editedText.trim() }); }
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
        <CertaintyBadge state={reviewStatus === 'accepted' ? 'confirmed' : certainty === 'unknown' ? 'unknown' : 'recommended'}
          label={reviewStatus === 'accepted' ? '운영자 확인' : CERTAINTY_LABEL[certainty]} />
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

    {proposal.kind === 'action' && <p className="meeting-review__unknown">실제 담당자는 미정입니다. {proposal.suggestedDue ? `원문 날짜 후보 ${proposal.suggestedDue}는 할 일 기한에 자동 반영되지 않습니다.` : '기한도 미정입니다.'}</p>}
    {unsavedEdit && reviewStatus === 'accepted' && <p className="meeting-review__disabled-note">수정한 문장을 저장해야 할 일에 반영할 수 있어요.</p>}
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
      {proposal.kind === 'action' && <Button type="button" variant="outline" disabled={!canApply || saved} onClick={applyTask}>
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
      <div className="meeting-review__source" aria-label="저장된 회의 원문">
        <div className="meeting-review__source-head"><strong>저장된 원문</strong><span className="mono">v{entry?.revision ?? '—'}</span></div>
        <pre className="meeting-review__source-body">{body}</pre>
      </div>
      <div className="meeting-review__results">
        <div className="meeting-review__results-head"><strong>검토 후보</strong><span className="num">{visibleProposals.length}개</span></div>
        <UsageNote usage={usage} />
        {visibleProposals.length === 0 ? <p className="meeting-review__message">이번 분석에서 후보를 찾지 못했어요. 원문은 보존돼 있습니다.</p>
          : <ul className="meeting-review__candidates">{visibleProposals.map((proposal) => <Candidate
              key={proposal.id} proposal={proposal} body={body} selected={selectedId === proposal.id}
              disabled={!canReview} busy={working} onSelect={setSelectedId}
              onReview={onReview} onApplyTask={applyOneTask} onRetry={onRetry} />)}</ul>}
      </div>
    </div>}
  </section>;
}
