"use client";

import React from 'react';
import { buildMeetingTaskCommand, meetingReviewWriteSucceeded, meetingTaskWriteSucceeded, readMeetingReviewEnvelope } from '@/lib/meeting-review-client';
import { MeetingReviewPanel } from './meeting-review-panel';

const ENDPOINT = '/api/hub/journal/meeting-review';
const EMPTY = { status: 'loading', run: null, proposals: [], usage: { status: 'unknown' } };

function failureMessage(data, fallback) {
  if (data?.status === 'preview') return '분석 또는 검토 저장소 연결이 필요해요. 연결한 뒤 다시 확인해 주세요.';
  if (data?.status === 'conflict') return '그사이 원문이나 검토 상태가 바뀌었어요. 저장본을 다시 확인해 주세요.';
  if (data?.status === 'unknown') return '요청 결과를 확인하지 못했어요. 먼저 이전 결과를 다시 확인해 주세요.';
  return data?.message || fallback;
}

async function responseJson(response) {
  return response.json().catch(() => null);
}

async function postJson(path, payload, timeout) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout),
  });
  return { response, data: await responseJson(response) };
}

export function MeetingReviewController({ entry, disabledReason = null, onApplied }) {
  const entryId = entry?.id;
  const revision = entry?.revision;
  const identity = `${entryId || ''}:${revision || ''}`;
  const currentIdentity = React.useRef(identity);
  currentIdentity.current = identity;
  const mounted = React.useRef(true);
  const serial = React.useRef(0);
  const operation = React.useRef(false);
  const [view, setView] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  function markApplication(proposalId, application) {
    setView((previous) => previous.status !== 'live' ? previous : ({
      ...previous,
      proposals: previous.proposals.map((item) => item.id === proposalId ? { ...item, application } : item),
    }));
  }
  function markAnalysisUnknown(requestId) {
    setView((previous) => previous.status !== 'live' ? previous : ({
      ...previous, run: { requestId, state: 'unknown', sourceRevision: revision, stale: false }, proposals: [],
      usage: { status: 'unknown' },
    }));
  }

  const refresh = React.useCallback(async ({ keepLive = false } = {}) => {
    if (!entryId) return null;
    const ticket = ++serial.current;
    let envelope;
    try {
      const response = await fetch(`${ENDPOINT}?entryId=${encodeURIComponent(entryId)}`, {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      envelope = readMeetingReviewEnvelope(response, await responseJson(response));
      if (envelope.status === 'live' && (envelope.entryId !== entryId || envelope.revision !== revision)) {
        envelope = { ...EMPTY, status: 'error', error: '원문 버전을 확인하지 못했어요. 메모를 다시 불러와 주세요.' };
      }
    } catch {
      envelope = { ...EMPTY, status: 'error', error: '검토 정보에 연결하지 못했어요. 다시 확인해 주세요.' };
    }
    if (!mounted.current || ticket !== serial.current || identity !== currentIdentity.current) return null;
    setView((previous) => {
      if (keepLive && envelope.status === 'error' && previous.status === 'live') return previous;
      return envelope;
    });
    if (keepLive && envelope.status === 'error') setError(envelope.error || '검토 결과를 다시 읽지 못했어요.');
    return envelope;
  }, [entryId, identity, revision]);

  React.useEffect(() => {
    mounted.current = true;
    setView(EMPTY);
    setError('');
    refresh();
    return () => { mounted.current = false; serial.current++; };
  }, [refresh]);

  const editable = !disabledReason && view.status === 'live' && entry?.body?.trim() && !operation.current;
  const matchingRun = view.run?.sourceRevision === revision && view.run?.state === 'ready';

  async function analyze() {
    if (!editable || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    const requestId = crypto.randomUUID();
    try {
      const { response, data } = await postJson(ENDPOINT, {
        action: 'analyze', requestId, entryId, expectedRevision: revision,
      }, 65000);
      const latest = await refresh({ keepLive: true });
      if (latest?.status === 'live' && latest.run?.requestId === requestId
        && ['ready', 'error', 'generating', 'unknown'].includes(latest.run.state)) return;
      if (!meetingReviewWriteSucceeded(response, data)) {
        if (data?.status === 'unknown' || response.status >= 500) markAnalysisUnknown(requestId);
        setError(failureMessage(data, '분석 결과를 확인하지 못했어요. 이전 요청 결과를 확인해 주세요.'));
        return;
      }
      markAnalysisUnknown(requestId);
      setError('분석은 완료됐지만 저장된 결과를 다시 읽지 못했어요. 결과 확인을 눌러 주세요.');
    } catch {
      const latest = await refresh({ keepLive: true });
      if (latest?.status === 'live' && latest.run?.requestId === requestId
        && ['ready', 'error', 'generating', 'unknown'].includes(latest.run.state)) return;
      markAnalysisUnknown(requestId);
      setError('분석 응답이 끊겼어요. 새 분석을 실행하기 전에 이전 요청 결과를 확인해 주세요.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function review(proposalId, { decision, editedText }) {
    if (!editable || !matchingRun || operation.current) throw new Error('현재 저장된 원문과 후보를 다시 확인해 주세요.');
    const proposal = view.proposals.find((item) => item.id === proposalId);
    if (!proposal) throw new Error('검토할 후보를 다시 확인해 주세요.');
    operation.current = true;
    setBusy(true);
    setError('');
    let outcome = null;
    try {
      outcome = await postJson(ENDPOINT, {
        action: 'review', entryId, proposalId, decision, editedText,
      }, 20000);
    } catch {
      // The server may have saved before the response or timeout was lost.
    }
    try {
      const latest = await refresh({ keepLive: true });
      const saved = latest?.status === 'live' && latest.proposals.some((item) =>
        item.id === proposalId && item.review?.status === decision
          && (decision !== 'accepted' || item.review.text === editedText));
      if (saved) return;
      if (!outcome) throw new Error('검토 저장 응답을 확인하지 못했어요. 결과를 다시 확인해 주세요.');
      if (!meetingReviewWriteSucceeded(outcome.response, outcome.data)) throw new Error(failureMessage(outcome.data, '검토 결과를 저장하지 못했어요.'));
      throw new Error('검토 저장 응답은 받았지만 다시 읽지 못했어요. 결과를 확인해 주세요.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function applyTask(proposalId) {
    if (!editable || !matchingRun || operation.current) throw new Error('현재 저장된 원문과 후보를 다시 확인해 주세요.');
    const proposal = view.proposals.find((item) => item.id === proposalId);
    if (proposal?.application?.status === 'saved') return;
    const command = buildMeetingTaskCommand(entry, proposal);
    if (!command) throw new Error('원문 근거나 확인한 문장이 달라졌어요. 다시 검토해 주세요.');
    operation.current = true;
    setBusy(true);
    setError('');
    let outcome = null;
    try {
      outcome = await postJson('/api/hub/journal', command, 20000);
    } catch {
      // A lost response is resolved by the receipt projection below.
    }
    try {
      const latest = await refresh({ keepLive: true });
      const recovered = latest?.status === 'live' && latest.proposals.some((item) =>
        item.id === proposalId && item.application?.status === 'saved');
      if (recovered || (outcome && meetingTaskWriteSucceeded(outcome.response, outcome.data, command))) {
        if (!recovered && outcome) markApplication(proposalId, {
          status: 'saved', targetId: outcome.data.target.id, href: outcome.data.target.href,
        });
        if (mounted.current && identity === currentIdentity.current) onApplied?.();
        if (!recovered) setError('할 일 저장은 확인됐지만 연결 기록을 다시 읽지 못했어요. 결과 확인을 눌러 주세요.');
        return;
      }
      if (!outcome || outcome.data?.status === 'unknown' || outcome.response.status >= 500) {
        markApplication(proposalId, { status: 'unknown' });
      }
      if (!outcome) throw new Error('할 일 등록 응답을 확인하지 못했어요. 새 후보를 만들지 말고 같은 후보의 결과를 확인해 주세요.');
      throw new Error(failureMessage(outcome.data, '할 일 등록 결과를 확인하지 못했어요. 같은 후보에서 다시 확인해 주세요.'));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function retry() {
    if (operation.current) return;
    operation.current = true;
    setError('');
    setBusy(true);
    try {
      const latest = await refresh({ keepLive: true });
      if (latest?.status === 'error') setError(latest.error || '결과를 다시 읽지 못했어요.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return <MeetingReviewPanel entry={entry} status={view.status} run={view.run} proposals={view.proposals} usage={view.usage}
    busy={busy} error={error || view.error || ''} disabledReason={disabledReason}
    onAnalyze={analyze} onReview={review} onApplyTask={applyTask} onRetry={retry} />;
}
