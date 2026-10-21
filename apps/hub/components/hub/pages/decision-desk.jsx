'use client';

// 결정 데스크 — 정할 것 큐 + 정하기 패널(docs/superpowers/specs/2026-10-15-decision-desk-design.md).
// 결정 일지의 기본 보기다. 왼쪽은 정할 것(막힘·미정)과 최근 결정, 오른쪽은 고른 한 건을 정하는 패널.
// 선택지를 하나 고르면 그게 결정이 되고, 고르지 않은 선택지도 결정 옆에 남는다.

import React from 'react';
import { Button, Checkbox, CheckboxRow, EmptyState, IconButton, Kbd, SegmentedControl, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { decisionSourceLabel } from '@/lib/decision-sources';
import { kstDayKey } from '@/lib/kst-day';
import {
  addOption, chosenOption, deferUntilKey, deskFilterOptions, deskFormFor, filterQueue, optionLabel, outcomePreview,
  recentDecisions, removeOption, OPTION_LIMIT,
} from '@/lib/decision-desk';
import { newDecisionIds } from '../decision-actions';
import { decideDeskItem, deferDeskItems, saveDeskDraft } from '../decision-desk-actions';
import './decision-desk.css';

const inField = (target) => {
  const tag = target?.tagName ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
};
const overlayOpen = () => typeof document !== 'undefined'
  && Boolean(document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]'));

function hours(value) {
  return Number.isFinite(Number(value)) && value !== null && value !== '' ? `${Number(value)}시간` : '';
}

/** 정하기 패널 머리의 맥락 칸 — 비어 있는 칸은 그리지 않는다. */
export function deskContext(item) {
  if (item?.kind === 'blocked') {
    const delivery = item.project.delivery || {};
    const remaining = hours(delivery.remainingHours);
    const available = hours(delivery.availableHours);
    return [
      { label: '막힌 이유', value: delivery.blocker || '' },
      { label: '목표일', value: item.project.dueAt ? kstDayKey(item.project.dueAt) : '', mono: true },
      { label: '남은 작업과 확보 시간', value: [remaining && `남은 ${remaining}`, available && `확보 ${available}`].filter(Boolean).join(' · ') },
    ].filter((cell) => cell.value);
  }
  if (item?.kind === 'draft') {
    return [
      { label: '처음 적은 날', value: item.draft.createdAt ? kstDayKey(item.draft.createdAt) : '', mono: true },
      { label: '연결 프로젝트', value: item.draft.projectName || '' },
    ].filter((cell) => cell.value);
  }
  return [];
}

function QueueItem({ item, selected, checked, onSelect, onCheck }) {
  const urgent = item.kind === 'blocked';
  return (
    <li className="dd-item" data-selected={selected ? 'true' : undefined}>
      <Checkbox checked={checked} onChange={() => onCheck(item.key)} label={`미룰 것으로 고르기: ${item.title}`} />
      <button type="button" className="dd-item__body" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(item.key)}>
        <span className="dd-item__meta" data-urgent={urgent ? 'true' : undefined}>{item.meta || '새로 적는 중'}</span>
        <span className="dd-item__title">{item.title || '새 정할 것'}</span>
        {item.options?.length ? <span className="dd-item__sub">선택지 <span className="mono">{item.options.length}</span>{item.chosenOptionId ? ' · 기울어진 선택 있음' : ''}</span> : null}
      </button>
    </li>
  );
}

function RecentList({ decisions, onOpenJournal }) {
  const recent = recentDecisions(decisions);
  if (!recent.length) return null;
  return (
    <section className="dd-recent" aria-label="최근 결정">
      <div className="dd-recent__head">
        <h4 className="fx-eyebrow">최근 결정</h4>
        <Button variant="ghost" size="xs" onClick={onOpenJournal}>일지 전체 →</Button>
      </div>
      <ul>
        {recent.map((decision) => {
          const tasks = Array.isArray(decision.followups) ? decision.followups.length : null;
          return (
            <li key={decision.id} className="dd-recent__row">
              <span className="mono dd-recent__date">{kstDayKey(decision.decidedAt).slice(5)}</span>
              <span className="dd-recent__title">{decision.title}</span>
              <span className="dd-recent__sub">{decisionSourceLabel(decision.source)}{tasks !== null ? <> · 할 일 <span className="mono">{tasks}</span></> : null}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 정하기 패널 — 질문, 맥락, 선택지, 근거, 그래서 할 일, 남기면 줄, 세 버튼. */
export function DeskPanel({ item, form, onForm, busy = false, error = '', onDecide, onDraft, onAskAdvice }) {
  const chosen = chosenOption(form);
  const chosenIndex = chosen ? form.options.findIndex((option) => option.id === chosen.id) : -1;
  const chosenLabel = chosenIndex >= 0 ? optionLabel(chosenIndex) : '';
  const preview = outcomePreview(item, form);
  const context = deskContext(item);
  const setOption = (id, key, value) => onForm({ ...form, options: form.options.map((option) => (option.id === id ? { ...option, [key]: value } : option)) });
  const name = `dd-choice-${item.key}`;

  return (
    <article className="fx-card dd-panel" aria-label={`정하기 — ${item.title || '새 정할 것'}`} aria-busy={busy ? 'true' : undefined}>
      <div className="dd-panel__meta">
        <span data-urgent={item.kind === 'blocked' ? 'true' : undefined}>{item.meta || '새로 적는 중'}</span>
        {item.project ? <span>{item.project.name}</span> : null}
      </div>
      {item.kind === 'new' ? (
        <TextField label="무엇을 정하나" value={form.question} maxLength={300} placeholder="예: 가격은 연 결제 할인을 줄까" autoFocus
          onChange={(e) => onForm({ ...form, question: e.target.value })} />
      ) : (
        <h3 className="fx-card-title dd-panel__title">{form.question || item.question}</h3>
      )}

      {context.length ? (
        <dl className="dd-context">
          {context.map((cell) => (
            <div key={cell.label}>
              <dt>{cell.label}</dt>
              <dd className={cell.mono ? 'mono' : undefined}>{cell.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <fieldset className="dd-options">
        <legend>선택지 — 하나를 고르면 그게 결정이 됩니다</legend>
        {form.options.map((option, index) => (
          <div key={option.id} className="dd-option" data-chosen={option.id === form.chosenOptionId ? 'true' : undefined}>
            <input type="radio" name={name} className="dd-option__radio" checked={option.id === form.chosenOptionId}
              aria-label={`${optionLabel(index)} 고르기`} onChange={() => onForm({ ...form, chosenOptionId: option.id })} />
            <div className="dd-option__fields">
              <TextField label={optionLabel(index)} value={option.title} maxLength={200} placeholder="무엇을 하나"
                onChange={(e) => setOption(option.id, 'title', e.target.value)} />
              <div className="dd-option__trade">
                <TextField label="얻는 것" value={option.gain} maxLength={300} onChange={(e) => setOption(option.id, 'gain', e.target.value)} />
                <TextField label="잃는 것" value={option.loss} maxLength={300} onChange={(e) => setOption(option.id, 'loss', e.target.value)} />
              </div>
            </div>
            {form.options.length > 1 ? (
              <IconButton icon="x" size={28} iconSize={13} tooltip={`${optionLabel(index)} 빼기`} onClick={() => onForm(removeOption(form, option.id))} />
            ) : null}
          </div>
        ))}
        {form.options.length < OPTION_LIMIT ? (
          <Button variant="ghost" size="sm" icon="plus" onClick={() => onForm(addOption(form))}>선택지 추가</Button>
        ) : null}
      </fieldset>

      <TextAreaField label={chosenLabel ? `왜 ${chosenLabel}인가` : '왜 이렇게 정하나'} rows={3} value={form.rationale} maxLength={4000}
        placeholder="맥락, 고른 것과 버린 것" onChange={(e) => onForm({ ...form, rationale: e.target.value })} />

      <div className="dd-task">
        <TextField label="그래서 할 일 (선택)" value={form.taskTitle} maxLength={300} placeholder="이 결정으로 생기는 다음 행동 하나"
          onChange={(e) => onForm({ ...form, taskTitle: e.target.value })} fieldStyle={{ flex: '1 1 240px' }} />
        {form.taskTitle.trim() ? (
          <TextField label="기한 (선택)" type="date" value={form.taskDueAt} onChange={(e) => onForm({ ...form, taskDueAt: e.target.value })} fieldStyle={{ flex: '0 1 180px' }} />
        ) : null}
      </div>

      {item.kind === 'blocked' ? (
        <CheckboxRow checked={form.clearBlocker} text="막힌 점 비우고 진행으로" onChange={(next) => onForm({ ...form, clearBlocker: next })} />
      ) : null}

      {preview.length ? (
        <p className="dd-preview" aria-live="polite">
          <span className="dd-preview__lead">남기면</span>
          {preview.map((line) => <span key={line}>{line}</span>)}
        </p>
      ) : null}
      {error ? <p className="dd-error" role="alert">{error}</p> : null}

      <div className="dd-actions">
        <Button variant="ghost" size="md" disabled={busy} onClick={onDraft}>아직 미정으로 저장</Button>
        <Button variant="ghost" size="md" icon="sparkle" disabled={busy} onClick={onAskAdvice}>조언 구하기</Button>
        <Button variant="primary" size="md" disabled={busy || !chosen || !form.question.trim()} onClick={onDecide}>
          {chosenLabel ? `${chosenLabel}으로 정하기` : '선택지를 고르면 정할 수 있습니다'} {chosen ? <Kbd>⌘↵</Kbd> : null}
        </Button>
      </div>
    </article>
  );
}

/**
 * @param queue           buildDecisionQueue 결과(work.jsx가 머리 줄과 같이 계산한다)
 * @param blockedReadable 막힌 프로젝트를 읽었는지 — 못 읽었으면 미정만 보인다고 말한다.
 */
export function DecisionDesk({ queue, decisions, blockedReadable = true, onSaved, onOpenJournal, onAskAdvice, onRetry, fetchImpl }) {
  const toast = useToast();
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));
  const [filter, setFilter] = React.useState('all');
  const [selectedKey, setSelectedKey] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());
  const [forms, setForms] = React.useState({});
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [hidden, setHidden] = React.useState(() => new Set());
  const [added, setAdded] = React.useState([]);
  const writeRef = React.useRef({}); // { [key]: { ids, progress } } — 재시도는 같은 id로 남은 단계만

  const all = React.useMemo(() => [...added, ...queue].filter((item) => !hidden.has(item.key)), [added, queue, hidden]);
  // 새로 적는 정할 것은 어느 거르기에서도 맨 위에 보인다.
  const visible = all.filter((item) => item.kind === 'new' || filterQueue([item], filter).length);
  const selected = visible.find((item) => item.key === selectedKey) || visible[0] || null;
  const form = selected ? forms[selected.key] || deskFormFor(selected) : null;
  const setForm = React.useCallback((next) => { if (selected) setForms((prev) => ({ ...prev, [selected.key]: next })); }, [selected]);
  const writeFor = (key) => (writeRef.current[key] ||= { ids: newDecisionIds(), progress: {} });

  const forget = (key) => {
    setHidden((prev) => new Set(prev).add(key));
    setChecked((prev) => { const next = new Set(prev); next.delete(key); return next; });
    setAdded((prev) => prev.filter((item) => item.key !== key));
    delete writeRef.current[key];
    const index = visible.findIndex((item) => item.key === key);
    setSelectedKey(visible[index + 1]?.key || visible[index - 1]?.key || null);
  };

  const decide = React.useCallback(async () => {
    if (!selected || !form || busy || !chosenOption(form)) return;
    const key = selected.key;
    const write = writeFor(key);
    setBusy(true); setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const result = await decideDeskItem(doFetch, selected, form, { ids: write.ids, progress: write.progress });
      write.progress = result.progress || write.progress;
      if (!result.ok) { setErrors((prev) => ({ ...prev, [key]: result.message })); return; }
      toast.success(`정했습니다 · ${chosenOption(form).title}`);
      if (result.message) toast.info(result.message);
      forget(key);
      onSaved?.();
    } finally { setBusy(false); }
  }, [selected, form, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft = async () => {
    if (!selected || !form || busy) return;
    const key = selected.key;
    setBusy(true); setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const result = await saveDeskDraft(doFetch, selected, form, { ids: writeFor(key).ids });
      if (!result.ok) { setErrors((prev) => ({ ...prev, [key]: result.message })); return; }
      toast.success('미정으로 남겼습니다 — 정할 것에 그대로 있습니다');
      if (selected.kind === 'new') forget(key);
      onSaved?.();
    } finally { setBusy(false); }
  };

  const deferChecked = async () => {
    const items = all.filter((item) => checked.has(item.key) && item.kind !== 'new');
    if (!items.length || busy) return;
    const until = deferUntilKey();
    setBusy(true);
    try {
      const result = await deferDeskItems(doFetch, items, until, { idsFor: (item) => writeFor(`defer:${item.key}`).ids });
      for (const key of result.deferred) forget(key);
      if (result.deferred.length) toast.success(`${result.deferred.length}건을 ${until.slice(5)}까지 미뤘습니다`);
      if (result.failed.length) toast.error(`${result.failed.length}건은 미루지 못했습니다 — ${result.failed[0].message}`);
      if (result.deferred.length) onSaved?.();
    } finally { setBusy(false); }
  };

  const addItem = () => {
    const item = { key: `new:${globalThis.crypto.randomUUID()}`, kind: 'new', title: '', question: '', project: null, draft: null, ageDays: null, meta: '', options: [], chosenOptionId: null };
    setAdded((prev) => [item, ...prev]);
    setSelectedKey(item.key);
  };

  const toggle = (key) => setChecked((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  // J/K 이동 · 1–5 선택지 · X 미룰 것으로 고르기 · ⌘↵ 정하기(입력 중에도).
  React.useEffect(() => {
    const onKey = (e) => {
      if (overlayOpen()) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); decide(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || inField(e.target)) return;
      const index = visible.findIndex((item) => item.key === selected?.key);
      if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') {
        const step = e.key.toLowerCase() === 'j' ? 1 : -1;
        const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
        if (next) { e.preventDefault(); setSelectedKey(next.key); }
      } else if (/^[1-5]$/.test(e.key) && form) {
        const option = form.options[Number(e.key) - 1];
        if (option) { e.preventDefault(); setForm({ ...form, chosenOptionId: option.id }); }
      } else if ((e.key === 'x' || e.key === 'X') && selected && selected.kind !== 'new') {
        e.preventDefault(); toggle(selected.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selected, form, setForm, decide]);

  const checkedCount = all.filter((item) => checked.has(item.key) && item.kind !== 'new').length;

  return (
    <div className="dd-desk">
      <section className="dd-left" aria-label="정할 것 목록">
        {!blockedReadable ? (
          <p className="dd-note"><TruthBadge state="partial" /> 막힌 프로젝트를 읽지 못해 미정 결정만 보입니다.
            {onRetry ? <Button variant="ghost" size="xs" onClick={onRetry}>다시 읽기</Button> : null}</p>
        ) : null}
        {queue.length + added.length > 0 ? (
          <SegmentedControl label="정할 것 거르기" value={filter} onChange={setFilter} options={deskFilterOptions(all)} />
        ) : null}
        {visible.length ? (
          <ul className="dd-queue">
            {visible.map((item) => (
              <QueueItem key={item.key} item={item} selected={item.key === selected?.key} checked={checked.has(item.key)}
                onSelect={setSelectedKey} onCheck={item.kind === 'new' ? () => {} : toggle} />
            ))}
          </ul>
        ) : (
          <EmptyState icon="decisions" title="정할 것이 없습니다" description="막힌 프로젝트도, 미정으로 남긴 결정도 없습니다."
            action={<Button variant="secondary" size="sm" icon="plus" onClick={addItem}>정할 것 추가</Button>} />
        )}
        {checkedCount ? (
          <div className="dd-bulk" role="status">
            <span><span className="mono">{checkedCount}</span>건 골랐습니다</span>
            <Button variant="secondary" size="sm" disabled={busy} onClick={deferChecked}>일주일 미루기</Button>
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>고르기 해제</Button>
          </div>
        ) : null}
        {visible.length ? (
          <Button variant="ghost" size="sm" icon="plus" className="dd-add" onClick={addItem}>정할 것 추가 — 아직 답 없는 질문</Button>
        ) : null}
        <RecentList decisions={decisions} onOpenJournal={onOpenJournal} />
      </section>

      {selected && form ? (
        <DeskPanel item={selected} form={form} onForm={setForm} busy={busy} error={errors[selected.key] || ''}
          onDecide={decide} onDraft={saveDraft}
          onAskAdvice={() => onAskAdvice?.({ title: form.question || selected.question, rationale: form.rationale,
            apply: (text) => setForms((prev) => ({ ...prev, [selected.key]: { ...(prev[selected.key] || form), rationale: form.rationale ? `${form.rationale}\n\n[Council 자문]:\n${text}` : text } })) })} />
      ) : null}

      <p className="dd-keys">
        <span><Kbd>J</Kbd> / <Kbd>K</Kbd> 정할 것 이동</span>
        <span><Kbd>1</Kbd>–<Kbd>5</Kbd> 선택지 고르기</span>
        <span><Kbd>⌘↵</Kbd> 정하기</span>
        <span><Kbd>X</Kbd> 고른 뒤 한 번에 미루기</span>
      </p>
    </div>
  );
}
