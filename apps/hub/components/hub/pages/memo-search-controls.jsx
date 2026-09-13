"use client";
import React from 'react';
import { Button, TextField, SelectField } from '../hub-primitives';
import { NOTE_QUESTIONS } from '@/lib/journal-client';
import { MEMO_SEARCH_DEFAULTS, memoPeriod } from '@/lib/journal-search-client';
import { MemoContextPicker } from './memo-context-picker';

export function MemoSearchControls({ filters, context, onApply }) {
  const [draft, setDraft] = React.useState(filters), [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState(null);
  const signature = JSON.stringify(filters);
  React.useEffect(() => { setDraft(JSON.parse(signature)); setChosen(null); }, [signature]);
  const update = (patch) => setDraft((previous) => ({ ...previous, ...patch }));
  const apply = () => onApply({ ...draft, q: draft.q.trim() });
  const chips = [
    filters.q && { label: `검색: ${filters.q}`, patch: { q: '' } },
    (filters.dateFrom || filters.dateTo) && { label: `${filters.dateFrom || '처음'} ~ ${filters.dateTo || '오늘 이후'}`, patch: { dateFrom: '', dateTo: '' } },
    filters.kind && { label: NOTE_QUESTIONS.find((item) => item.value === filters.kind)?.label || filters.kind, patch: { kind: '' } },
    filters.contextId && { label: context?.label || '연결된 업무', patch: { contextType: '', contextId: '' } },
    filters.used !== 'all' && { label: filters.used === 'used' ? '활용한 메모' : '아직 활용하지 않은 메모', patch: { used: 'all' } },
  ].filter(Boolean);
  const selected = draft.contextId ? [chosen || (context?.id === draft.contextId ? context : { type: draft.contextType, id: draft.contextId, label: '선택한 업무' })] : [];
  return <section className="memo-search" aria-label="메모 검색">
    <form onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <div className="memo-search-bar">
        <TextField label="메모 검색" value={draft.q} maxLength={200} placeholder="기억나는 단어로 찾기" onChange={(event) => update({ q: event.target.value })}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />
        <Button variant="primary" type="submit">찾기</Button>
        {draft.q && <Button aria-label="입력한 검색어 지우기" onClick={() => update({ q: '' })}>지우기</Button>}
        <Button variant="outline" aria-expanded={open} aria-controls="memo-search-details" onClick={() => setOpen((value) => !value)}>조건 {open ? '접기' : '열기'}</Button>
      </div>
      {open && <div id="memo-search-details" className="memo-search-details">
        <div className="memo-actions" aria-label="빠른 기간 선택">{[[1, '오늘'], [7, '최근 7일'], [30, '최근 30일']].map(([days, label]) => <Button variant="outline" key={days} onClick={() => {
          const next = { ...draft, ...memoPeriod(days) }; setDraft(next); onApply(next);
        }}>{label}</Button>)}</div>
        <div className="memo-fields"><TextField label="시작일 · 한국 시간" type="date" value={draft.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} />
          <TextField label="종료일 · 한국 시간" type="date" value={draft.dateTo} onChange={(event) => update({ dateTo: event.target.value })} /></div>
        <div className="memo-fields"><SelectField label="메모 종류" value={draft.kind} options={[{ value: '', label: '모든 종류' }, ...NOTE_QUESTIONS]} onChange={(event) => update({ kind: event.target.value })} />
          <SelectField label="활용 여부" value={draft.used} options={[{ value: 'all', label: '모두' }, { value: 'used', label: '할 일·콘텐츠에 활용함' }, { value: 'unused', label: '아직 활용하지 않음' }]} onChange={(event) => update({ used: event.target.value })} /></div>
        <MemoContextPicker single selected={selected} onChange={(rows) => { setChosen(rows[0] || null); update({ contextType: rows[0]?.type || '', contextId: rows[0]?.id || '' }); }} />
        <Button variant="primary" type="submit">조건 적용</Button>
      </div>}
    </form>
    {chips.length > 0 && <div className="memo-search-chips" aria-label="적용한 검색 조건">
      {chips.map((chip) => <Button key={chip.label} variant="outline" aria-label={`${chip.label} 조건 해제`} onClick={() => onApply({ ...filters, ...chip.patch })}>{chip.label} ×</Button>)}
      <Button onClick={() => { setDraft({ ...MEMO_SEARCH_DEFAULTS }); onApply({ ...MEMO_SEARCH_DEFAULTS }); }}>전체 해제</Button>
    </div>}
  </section>;
}
