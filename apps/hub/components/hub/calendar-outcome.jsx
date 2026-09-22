'use client';

import React from 'react';
import { Button, Checkbox, LifecycleBadge, Skeleton, TextAreaField } from './hub-primitives';

// Preserve unsaved notes when navigating between the home card and calendar drawer.
// Server records are always re-read; drafts are never treated as saved data.
const noteDrafts = new Map();

export function CalendarOutcome({ eventKey, title, whenLabel, expanded = false, onSavingChange }) {
  const [record, setRecord] = React.useState(null);
  const [note, setNote] = React.useState(() => noteDrafts.get(eventKey)?.note ?? '');
  const [open, setOpen] = React.useState(expanded || noteDrafts.has(eventKey));
  const [state, setState] = React.useState('loading');
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  const busyRef = React.useRef(false);
  const editButtonRef = React.useRef(null);
  const restoreFocusRef = React.useRef(false);
  const detailsId = React.useId();

  React.useEffect(() => {
    let active = true;
    setState('loading');
    setMessage('');
    if (!eventKey) {
      setState('error');
      setMessage('일정 기록을 연결하지 못했어요. 캘린더를 새로고침해 주세요.');
      return;
    }
    fetch(`/api/hub/calendar-outcomes?eventKey=${encodeURIComponent(eventKey)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async response => {
        const data = await response.json();
        if (!active) return;
        if (!response.ok || data.status !== 'live' || !data.outcome) {
          setState(data.status === 'preview' ? 'preview' : 'error');
          setMessage(data.message || '일정 기록을 불러오지 못했어요.');
          return;
        }
        const draft = noteDrafts.get(eventKey);
        setRecord(draft?.base || data.outcome);
        setNote(draft?.note ?? data.outcome.note);
        if (draft && draft.base.revision !== data.outcome.revision) {
          setConflict({ current: data.outcome, wantedDone: draft.base.done });
          setOpen(true);
          setMessage('작성 중 다른 창에서 기록이 변경됐어요. 현재 기록을 확인해 주세요.');
        }
        setState('live');
      })
      .catch(() => {
        if (active) { setState('error'); setMessage('일정 기록을 불러오지 못했어요.'); }
      });
    return () => { active = false; };
  }, [eventKey, retry]);

  React.useEffect(() => {
    if (!open && !saving && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [open, saving]);

  async function save(done = record?.done, expectedRevision = record?.revision) {
    if (busyRef.current || state !== 'live' || !record) return;
    busyRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    setMessage('');
    try {
      const response = await fetch('/api/hub/calendar-outcomes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventKey, done, note, expectedRevision }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (response.ok && ['saved', 'duplicate'].includes(data.status) && data.outcome?.eventKey === eventKey) {
        setRecord(data.outcome);
        setNote(data.outcome.note);
        noteDrafts.delete(eventKey);
        setConflict(null);
        restoreFocusRef.current = open;
        setOpen(false);
        setMessage('저장됨');
      } else if (data.status === 'conflict' && data.outcome) {
        setConflict({ current: data.outcome, wantedDone: done });
        setOpen(true);
        setMessage(data.message);
      } else {
        setMessage(data.message || '저장을 확인하지 못했어요. 다시 시도해 주세요.');
      }
    } catch {
      setMessage('저장을 확인하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  function editNote(value) {
    setNote(value);
    if (value === record?.note) noteDrafts.delete(eventKey);
    else noteDrafts.set(eventKey, { note: value, base: record });
    setMessage('');
  }

  const error = state !== 'preview' && message && message !== '저장됨';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Checkbox checked={record?.done} onChange={done => save(done)} disabled={state !== 'live' || saving || Boolean(conflict)} label={`${title} 완료`} size={18} />
        {whenLabel && <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', padding: '2px 6px', borderRadius: 'var(--r-xs)', flexShrink: 0 }}>{whenLabel}</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: record?.done ? 'var(--fg-muted)' : 'var(--fg)', textDecoration: record?.done ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>{title}</span>
        {record?.done && <LifecycleBadge state="done" />}
        <Button ref={editButtonRef} variant="ghost" size="xs" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)} disabled={saving}>{open ? '접기' : record?.note ? '수정' : '특이사항'}</Button>
      </div>
      {state === 'loading' && <Skeleton width="45%" height={12} />}
      {!open && record?.note && <div style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6, paddingLeft: 26 }}>{record.note}</div>}
      {open && state === 'live' && (
        <div id={detailsId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TextAreaField label="특이사항" value={note} onChange={event => editNote(event.target.value)} maxLength={4000} rows={3} disabled={saving} placeholder="진행 결과나 다음에 확인할 내용을 남기세요" onCmdEnter={() => !conflict && save()} />
          {conflict ? (
            <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>현재 저장된 기록 · {conflict.current.done ? '완료' : '미완료'}{'\n'}{conflict.current.note || '특이사항 없음'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setRecord(conflict.current); setNote(conflict.current.note); noteDrafts.delete(eventKey); setConflict(null); setMessage(''); }}>현재 기록 사용</Button>
                <Button variant="outline" size="sm" disabled={saving} onClick={() => save(conflict.wantedDone, conflict.current.revision)}>내 내용 다시 저장</Button>
              </div>
            </div>
          ) : <Button variant="secondary" size="sm" disabled={saving} onClick={() => save()} style={{ alignSelf: 'flex-end' }}>{saving ? '저장 중…' : '저장'}</Button>}
        </div>
      )}
      {(saving || message) && <div role={error ? 'alert' : 'status'} aria-live="polite" style={{ fontSize: 12, color: error ? 'var(--danger)' : 'var(--fg-dim)' }}>
        {saving ? '저장 중…' : message}
        {(state === 'error' || state === 'preview') && <Button variant="ghost" size="xs" onClick={() => setRetry(value => value + 1)}>다시 시도</Button>}
      </div>}
    </div>
  );
}
