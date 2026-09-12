"use client";
import React from 'react';
import Link from 'next/link';
import { Button, Drawer, SelectField, TextAreaField, TextField, TruthBadge } from '../hub-primitives';
import { NOTE_QUESTIONS, selectedNoteExcerpt } from '@/lib/journal-client';
import { MemoContextPicker } from './memo-context-picker';

const localTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
export const memoTime = (value) => new Date(value).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function MemoComposer({ model, isNew, onClose, onReload }) {
  const { draft, entry, ready, locked, busy, dirty, pending, conflict, source, edit } = model;
  const [selection, setSelection] = React.useState(null), [helper, setHelper] = React.useState(Boolean(draft?.noteMeta.enhancement));
  const bodyRef = React.useRef(null);
  React.useEffect(() => { setSelection(null); }, [draft?.body]);
  React.useEffect(() => { if (ready && draft?.noteMeta.enhancement) setHelper(true); }, [ready]);
  const question = NOTE_QUESTIONS.find((item) => item.value === draft?.noteMeta.kind) || NOTE_QUESTIONS[0];
  const canUse = Boolean(entry && !dirty && !locked && source === 'live' && selection);
  const truth = busy ? 'syncing' : model.saveState === 'error' || conflict ? 'error' : model.saveState === 'saved' || (entry && !dirty && !pending) ? 'live' : 'preview';
  const truthLabel = busy ? '저장 중' : pending ? '저장 결과 확인 필요' : conflict ? '원문 변경 확인' : dirty ? '작성 중 · 서버 미저장' : entry ? '저장된 메모' : '아직 저장되지 않음';
  function selectionChanged(event) {
    setSelection(selectedNoteExcerpt(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd));
  }
  function copy() { navigator.clipboard.writeText([draft.body, draft.noteMeta.enhancement].filter(Boolean).join('\n\n')).catch(() => bodyRef.current?.select()); }
  return <Drawer title={isNew && !entry ? '메모 남기기' : '메모'} subtitle="짧게 남기고, 필요한 순간 꺼내 쓰세요." presentation={isNew && !entry ? 'compact' : 'side'} width="min(620px, 96vw)" initialFocusRef={bodyRef} onClose={() => { if (!busy) onClose(); }}
    footer={<div className="memo-footer">
      <Button variant="primary" disabled={!ready || !draft || !dirty || locked || Boolean(conflict) || source !== 'live'} onClick={model.save}>{busy ? '저장 중…' : entry ? '수정 저장' : '메모 저장'}</Button>
      <span className="memo-muted">{pending ? '이전 요청을 먼저 확인해 주세요' : '이 탭에서 다시 열거나 새로고침해도 이어 쓸 수 있어요'}</span>
    </div>}>
    <div className="memo-composer memo-stack">
      {!ready ? <p role="status">메모를 불러오고 있어요…</p> : !draft ? <div role="alert"><p>{model.loadError}</p><Button onClick={onReload}>다시 불러오기</Button></div> : <>
        <div aria-live="polite"><TruthBadge state={truth} label={truthLabel} /></div>
        {source !== 'live' && <div className="memo-feedback"><TruthBadge state={source} /><p>저장소를 확인한 뒤 서버에 저장할 수 있어요.</p><Button onClick={onReload} disabled={busy}>연결 다시 확인</Button><Button onClick={copy}>입력 복사</Button></div>}
        {model.localError && <div className="memo-feedback" role="alert"><p>이 탭의 복구 사본을 저장하지 못했어요. 입력을 복사해 보관해 주세요.</p><Button onClick={copy}>입력 복사</Button></div>}
        <TextAreaField ref={bodyRef} label="원문 메모" placeholder="기억하고 싶은 일이나 떠오른 생각을 한 줄로…" value={draft.body} rows={isNew && !entry ? 5 : 9} maxLength={20000} disabled={locked}
          onChange={(event) => edit({ body: event.target.value })} onSelect={selectionChanged} hint={entry ? '활용할 문장을 드래그하거나 키보드로 선택하세요. 발췌는 3,500자까지 보낼 수 있어요.' : '제목이나 분류 없이 바로 저장할 수 있어요.'} />
        <details className="memo-details"><summary>제목·시각·업무 연결 <span className="memo-muted">선택</span></summary><div className="memo-stack">
          <TextField label="제목" value={draft.title} maxLength={200} disabled={locked} onChange={(event) => edit({ title: event.target.value })} />
          <TextField label="기록 시각" type="datetime-local" value={localTime(draft.occurredAt)} disabled={locked} onChange={(event) => { const date = new Date(event.target.value); if (!Number.isNaN(date.getTime())) edit({ occurredAt: date.toISOString() }); }} />
          <MemoContextPicker selected={draft.contexts} onChange={(contexts) => edit({ contexts })} disabled={locked} />
        </div></details>
        {draft.contexts.length > 0 && <div className="memo-muted">연결된 업무 · {draft.contexts.map((context) => context.label || '저장된 업무').join(', ')}</div>}
        {entry && <section className="memo-section">
          <Button variant="outline" aria-expanded={helper} onClick={() => setHelper(!helper)}>한 줄 보강하기 <span className="memo-muted">선택</span></Button>
          {helper && <div className="memo-stack">
            <SelectField label="어떤 메모인가요?" options={NOTE_QUESTIONS} value={draft.noteMeta.kind} disabled={locked} onChange={(event) => edit({ noteMeta: { ...draft.noteMeta, kind: event.target.value } })} />
            <TextAreaField label={question.question} hint="직접 본 일과 내 해석을 구분해 적어보세요. 건너뛰어도 메모는 이미 저장되어 있어요." value={draft.noteMeta.enhancement} maxLength={4000} rows={3} disabled={locked} onChange={(event) => edit({ noteMeta: { ...draft.noteMeta, enhancement: event.target.value } })} />
          </div>}
        </section>}
        {conflict && <section className="memo-feedback" aria-label="메모 변경 비교"><p>다른 창에서 이 메모를 수정했어요. 내 입력은 위에 남아 있어요.</p>
          <details><summary>현재 저장본 보기</summary><pre>{conflict.body}</pre>{conflict.noteMeta?.enhancement && <p>{conflict.noteMeta.enhancement}</p>}</details>
          <div className="memo-actions"><Button disabled={locked} onClick={() => model.chooseConflict(false)}>현재 저장본 사용</Button><Button variant="outline" disabled={locked} onClick={() => model.chooseConflict(true)}>내 입력 이어서 수정</Button></div>
        </section>}
        {model.message && <div className="memo-feedback" role={model.saveState === 'error' ? 'alert' : 'status'}><p>{model.message}</p>
          {pending && <Button variant="outline" disabled={busy || !model.workspaceConfirmed || model.source === 'loading'} onClick={model.retry}>이전 요청 결과 확인</Button>}
          {model.target && <Link className="memo-target-link hub-row" href={model.target.href}>{model.target.type === 'task' ? '만든 할 일 열기' : '콘텐츠 스튜디오 열기'} →</Link>}
        </div>}
        {entry && <section className="memo-section"><h3>필요한 부분 활용하기</h3>
          <p className="memo-muted">{dirty ? '변경 내용을 저장한 뒤 발췌를 선택해 주세요.' : selection ? '선택한 발췌와 원문 링크만 전달됩니다.' : '위 원문에서 활용할 문장을 선택해 주세요.'}</p>
          {selection && <blockquote className="memo-selection">{selection.text}</blockquote>}
          <div className="memo-actions"><Button variant="outline" disabled={!canUse} onClick={() => model.prepareUse('create_task', selection)}>할 일로</Button><Button variant="outline" disabled={!canUse} onClick={() => model.prepareUse('create_content', selection)}>콘텐츠로</Button></div>
        </section>}
        {entry?.links?.length > 0 && <section className="memo-section"><h3>이 메모를 사용한 곳</h3><ul className="memo-uses">{entry.links.map((link) => <li key={link.id}>
          <Link href={link.href} className="hub-row">{link.targetType === 'task' ? '할 일' : '콘텐츠'} · {link.title}</Link>
          <span className="memo-muted mono">{memoTime(link.createdAt)} · {link.sourceRevision === entry.revision ? '현재 원문에서 사용' : `이전 원문 v${link.sourceRevision}에서 사용`}</span>
          <details><summary>사용한 발췌</summary><blockquote>{link.excerpt}</blockquote></details>
        </li>)}</ul></section>}
      </>}
    </div>
  </Drawer>;
}
