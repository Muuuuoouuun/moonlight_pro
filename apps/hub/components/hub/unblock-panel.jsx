"use client";

// 막힘 풀기 — 세 갈래 입력(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §5.2·§5.4).
// 확인할 것 카드(막힌 프로젝트의 끝내기 1·2)와 프로젝트 상세가 같은 컴포넌트를 쓴다. 결과도 같다.
//
// 권장은 순서와 표시일 뿐이다 — 병목이 의사결정이면 결정으로 풀기를 앞에 두고 `병목에 맞춘 권장`을
// 단다(§5.3 recommended 문법). 어느 갈래든 운영자가 고른다.

import React from 'react';
import { Iconed } from './hub-icons';
import { Button, CertaintyBadge, CheckboxRow, LifecycleBadge, SegmentedControl, TextAreaField, TextField, useToast } from './hub-primitives';
import { BLOCKER_KIND_LABELS } from '../../../../packages/project-delivery/index.ts';
import { newUnblockIds, readProjectForUnblock, unblockProject } from './unblock-actions';
import './unblock-panel.css';

const BRANCH_LABELS = { resolved: '이유가 풀렸어요', decision: '결정으로 풀기', 'next-version': '다음 버전으로' };
const RESOLUTION_LABELS = { resolved: '이유가 풀림', decision: '결정으로 풀림', 'next-version': '다음 버전으로 넘김' };

const dayLabel = (value) => {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(ms));
};

export function blockerFacts(delivery, now = Date.now()) {
  const kind = BLOCKER_KIND_LABELS[delivery?.blockerKind] || '';
  const pausedMs = Date.parse(delivery?.pausedAt || '');
  const days = Number.isFinite(pausedMs) ? Math.max(0, Math.floor((now - pausedMs) / 86400000)) : null;
  return { kind, days, line: [kind, days !== null ? `${days}일째` : ''].filter(Boolean).join(' · ') };
}

export function recommendedBranchFor(delivery) {
  return delivery?.blockerKind === 'decision' ? 'decision' : 'resolved';
}

function branchOrder(recommended) {
  return recommended === 'decision' ? ['decision', 'resolved', 'next-version'] : ['resolved', 'decision', 'next-version'];
}

function successMessage(branch, result) {
  if (branch === 'decision') return result.unblocked ? '결정을 남기고 막힘을 풀었습니다' : '결정을 남겼습니다 · 막힌 점은 그대로입니다';
  if (branch === 'next-version') return '다음 버전으로 넘기고 다시 진행합니다';
  return '막힘을 풀고 다시 진행합니다';
}

/**
 * @param project   { id, name, delivery, updatedAt }
 * @param onUnblocked({ branch, decisionId, taskId, unblocked, message })
 */
export function UnblockPanel({ project, initialBranch = null, signalKey = '', onUnblocked, fetchImpl = globalThis.fetch, label = '막힘 풀기' }) {
  const [current, setCurrent] = React.useState(project);
  const recommended = recommendedBranchFor(current?.delivery);
  const [branch, setBranch] = React.useState(initialBranch || recommended);
  const [note, setNote] = React.useState('');
  const [nextVersionText, setNextVersionText] = React.useState('');
  const [decision, setDecision] = React.useState({ title: '', rationale: '', taskTitle: '', taskDueAt: '', clearBlocker: true });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [conflict, setConflict] = React.useState(false);
  const progressRef = React.useRef({});
  const idsRef = React.useRef(null);
  if (!idsRef.current) idsRef.current = newUnblockIds();

  const delivery = current?.delivery || {};
  const facts = blockerFacts(delivery);
  const history = Array.isArray(delivery.blockerHistory) ? delivery.blockerHistory.slice(-3).reverse() : [];
  const setField = (key, value) => setDecision((prev) => ({ ...prev, [key]: value }));
  const locked = Boolean(progressRef.current.decision); // 결정이 남은 뒤에는 결정 내용을 바꾸지 않는다(같은 id).

  async function run(target = current) {
    if (busy) return;
    setBusy(true);
    setError('');
    setConflict(false);
    const result = await unblockProject(fetchImpl, target, { branch, note, nextVersionText, decision }, {
      ids: idsRef.current, progress: progressRef.current, signalKey,
    });
    progressRef.current = result.progress || progressRef.current;
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setConflict(Boolean(result.conflict));
      return;
    }
    onUnblocked?.({ branch, decisionId: result.decisionId || null, taskId: result.taskId || null, unblocked: result.unblocked, message: successMessage(branch, result) });
  }

  // 다른 곳에서 먼저 바뀌었으면 최신 기록을 읽어 남은 단계(막힘 풀기)만 다시 한다.
  async function retryWithLatest() {
    setBusy(true);
    const latest = await readProjectForUnblock(fetchImpl, current.id);
    setBusy(false);
    if (!latest) { setError('최신 프로젝트 기록을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); return; }
    if (!String(latest.delivery?.blocker || '').trim()) {
      setError('');
      setConflict(false);
      onUnblocked?.({ branch, decisionId: progressRef.current.decision ? idsRef.current.decisionId : null, taskId: null, unblocked: true, message: '다른 곳에서 이미 막힘이 풀렸습니다' });
      return;
    }
    setCurrent(latest);
    await run(latest);
  }

  function submit(event) {
    event.preventDefault();
    run();
  }

  const submitLabel = busy ? '저장 중…'
    : branch === 'decision' ? (decision.clearBlocker ? '결정 남기고 막힘 풀기' : '결정만 남기기')
      : branch === 'next-version' ? '다음 버전으로 넘기고 진행'
        : '막힘 풀고 다시 진행';

  return (
    <form className="ub-panel" onSubmit={submit} aria-label={label}>
      <div className="ub-head">
        <LifecycleBadge state="blocked" />
        {facts.line ? <span className="ub-facts">{facts.line}</span> : null}
      </div>
      <p className="ub-blocker">{delivery.blocker || '막힌 점이 적혀 있지 않습니다.'}</p>

      <div className="ub-branch-head">
        <span className="fx-eyebrow">어떻게 풀까요</span>
        {recommended === 'decision' ? <CertaintyBadge state="recommended" label="병목에 맞춘 권장 · 결정으로 풀기" /> : null}
      </div>
      <SegmentedControl
        label="어떻게 풀까요"
        fill
        value={branch}
        onChange={(key) => { if (!locked) { setBranch(key); setError(''); } }}
        options={branchOrder(recommended).map((key) => ({ key, label: BRANCH_LABELS[key] }))}
      />

      {branch === 'resolved' ? (
        <TextField label="한 줄 메모 (선택)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="어떻게 풀렸나요" />
      ) : null}

      {branch === 'decision' ? (
        <div className="ub-fields">
          <TextField label="무엇을 정했나" required value={decision.title} maxLength={300} disabled={locked} onChange={(e) => setField('title', e.target.value)} placeholder="예: 범위를 A안으로 줄인다" />
          <TextAreaField label="왜 (선택)" rows={2} value={decision.rationale} maxLength={4000} disabled={locked} onChange={(e) => setField('rationale', e.target.value)} />
          <div className="ub-row">
            <TextField label="그래서 할 일 (선택)" value={decision.taskTitle} maxLength={300} disabled={Boolean(progressRef.current.task)} onChange={(e) => setField('taskTitle', e.target.value)} fieldStyle={{ flex: '1 1 220px' }} />
            <TextField label="기한" type="date" value={decision.taskDueAt} disabled={Boolean(progressRef.current.task)} onChange={(e) => setField('taskDueAt', e.target.value)} fieldStyle={{ flex: '0 0 160px' }} />
          </div>
          <CheckboxRow checked={decision.clearBlocker} onChange={(value) => setField('clearBlocker', value)} text="막힌 점 비우고 진행으로" />
        </div>
      ) : null}

      {branch === 'next-version' ? (
        <TextAreaField label="이번 범위에서 뺄 것" required rows={2} value={nextVersionText} maxLength={1000} onChange={(e) => setNextVersionText(e.target.value)} hint="다음 버전으로 넘길 범위 끝에 덧붙입니다" />
      ) : null}

      {error ? (
        <div className="ub-error" role="alert">
          <Iconed name="x" size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
          <span>
            {error}
            {conflict ? (
              <span className="ub-error__actions">
                <button type="button" className="fx-pill-btn" disabled={busy} onClick={retryWithLatest}>
                  {progressRef.current.decision ? '막힘만 다시 풀기' : '최신 기록으로 다시 풀기'}
                </button>
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="ub-actions">
        <button type="submit" className="fx-pill-btn fx-pill-btn--primary" disabled={busy}>{submitLabel}</button>
      </div>

      {history.length ? (
        <details className="ub-history">
          <summary>막힘 이력 · {delivery.blockerHistory.length}</summary>
          <ul>
            {history.map((entry, index) => (
              <li key={`${entry.resolvedAt}-${index}`}>
                <span>{entry.text}</span>
                <span className="ub-history__meta">
                  {RESOLUTION_LABELS[entry.resolution] || '풀림'}
                  {entry.kind && BLOCKER_KIND_LABELS[entry.kind] ? ` · ${BLOCKER_KIND_LABELS[entry.kind]}` : ''}
                  {entry.resolvedAt ? <> · <span className="mono">{dayLabel(entry.resolvedAt)}</span></> : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </form>
  );
}

// 프로젝트 상세의 막힘 풀기 자리(§5.4) — 막힌 점 글·병목·며칠째와 `막힘 풀기` 버튼, 누르면 같은 입력 칸.
// 풀리면 토스트로 알리고 부모가 기록을 다시 읽는다(막힌 점이 비면 이 자리는 사라진다).
export function ProjectUnblockSection({ project, onUnblocked, fetchImpl = globalThis.fetch }) {
  const [open, setOpen] = React.useState(false);
  const toast = useToast();
  const facts = blockerFacts(project?.delivery);
  if (!project?.delivery?.blocker) return null;
  return (
    <section className="ub-section" aria-label="막힘 풀기">
      <div className="ub-section__head">
        <h4>막힌 점</h4>
        {facts.line ? <span className="ub-facts">{facts.line}</span> : null}
      </div>
      {open ? (
        <UnblockPanel
          project={{ id: project.id, name: project.name, delivery: project.delivery, updatedAt: project.updatedAt }}
          fetchImpl={fetchImpl}
          onUnblocked={async (result) => {
            toast.success(result.message);
            setOpen(false);
            await onUnblocked?.(result);
          }}
        />
      ) : (
        <>
          <p className="ub-blocker">{project.delivery.blocker}</p>
          <div><Button variant="secondary" size="sm" aria-expanded={false} onClick={() => setOpen(true)}>막힘 풀기</Button></div>
        </>
      )}
      {open ? <div><Button variant="ghost" size="sm" aria-expanded onClick={() => setOpen(false)}>닫기</Button></div> : null}
    </section>
  );
}
