"use client";
import React from 'react';
import { GoalLinks } from '../goal-links';
import Link from 'next/link';
import { Button, Drawer, Kbd, SelectField, Skeleton, TextAreaField, TextField, TruthBadge, useToast } from '../hub-primitives';
import { Iconed } from '../hub-icons';
import { requestPersonaChat } from '../persona-client';
import { NOTE_QUESTIONS, selectedNoteExcerpt } from '@/lib/journal-client';
import { JOURNAL_TAG_LIMIT, JOURNAL_TAG_LENGTH, normalizeJournalTags } from '@/lib/journal-tags';
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from '@/lib/memo-intake-tasks';
import { readMemoFile } from '@/lib/memo-capture';
import { MemoContextPicker } from './memo-context-picker';
import { MeetingReviewController } from './meeting-review-controller';

const localTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
export const memoTime = (value) => new Date(value).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// AI가 뽑은 후보 한 줄을 create_task 명령으로 굳히고(첫 시도 전 한 번), 봉투로 저장을 판정한다.
// 고정 id·재시도·preview/unknown 판정 계약은 lib/memo-intake-tasks.js의 공용 경로가 소유한다.
export function freezeMemoAction(action, projectId) {
  return freezeTaskCommand(action, { projectId: projectId || null, source: 'memo-action-extract' });
}
export function registerMemoAction(action, fetchImpl = fetch) {
  return saveTaskCommand(action.command, fetchImpl);
}

function parseExtractedActions(text) {
  const parsed = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*•0-9.]+\s*\[?[ xX]?\]?\s*(.+)$/);
    if (match && match[1] && !match[1].startsWith("[") && match[1].length > 2 && !match[1].includes("핵심 요약") && !match[1].includes("추천 다음 액션")) {
      parsed.push(match[1].replace(/^\[|\]$/g, "").trim());
    } else if (trimmed.startsWith("1.") || trimmed.startsWith("2.") || trimmed.startsWith("3.")) {
      parsed.push(trimmed.replace(/^[0-9.]+\s*/, "").trim());
    }
  }
  return parsed.slice(0, 5);
}

function MemoActionExtractor({ text, contexts, active = true }) {
  const [open, setOpen] = React.useState(false);
  // extract.status: idle | loading | done | preview | error — preview·error를 "추출 결과 없음"으로 그리지 않는다(§5.3).
  const [extract, setExtract] = React.useState({ status: 'idle', note: '', source: '' });
  const [actions, setActions] = React.useState([]);
  const toast = useToast();

  const projectId = contexts?.find(c => c.type === 'project')?.id || null;
  const currentProject = React.useRef(projectId);
  currentProject.current = projectId;
  const sourceOwner = React.useRef({ text });
  // 문자열이 다시 같아져도 A → B → A는 다른 원문 세대다. effect 전 클릭/응답도 차단한다.
  if (sourceOwner.current.text !== text) sourceOwner.current = { text };
  const requestOwner = React.useRef(null);
  const mounted = React.useRef(true);
  const currentActions = React.useRef([]);
  const updateActions = (update) => {
    currentActions.current = update(currentActions.current);
    if (mounted.current) setActions(currentActions.current);
  };
  const patchAction = (id, patch) => updateActions(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestOwner.current?.controller.abort();
      requestOwner.current = null;
    };
  }, []);
  React.useEffect(() => {
    const source = sourceOwner.current;
    return () => {
      if (requestOwner.current?.source === source) {
        requestOwner.current.controller.abort();
        requestOwner.current = null;
      }
    };
  }, [text]);

  const handleExtract = async () => {
    const source = sourceOwner.current;
    if (!mounted.current) return;
    if (!source.text || source.text.trim().length < 10) {
      if (currentActions.current.some(action => action.command)) setOpen(true);
      return;
    }
    requestOwner.current?.controller.abort();
    const request = { source, controller: new AbortController() };
    requestOwner.current = request;
    const ownsRequest = () => mounted.current && requestOwner.current === request
      && sourceOwner.current === source && !request.controller.signal.aborted;
    setOpen(true);
    // 이미 전송한 명령/영수증은 새 AI 요청과 별개다. unknown 재시도도 같은 payload를 쓴다.
    updateActions(prev => prev.filter(item => item.command));
    setExtract({ status: 'loading', note: '', source: source.text, owner: source });
    try {
      const res = await requestPersonaChat({
        personaId: "order",
        mode: "extract-actions",
        draft: `[메모 원문]:\n${source.text}\n\n위 메모에서 운영자가 실행해야 할 후속 조치 및 액션 아이템 목록을 추출해줘.`,
      }, { signal: request.controller.signal });
      if (!ownsRequest()) return;
      if (res.state === "done") {
        // 후보마다 고정 id를 붙인다 — 등록 상태도 인덱스가 아니라 이 id에 묶인다.
        updateActions(prev => [...prev.filter(item => item.command), ...parseExtractedActions(res.text)
          .map(task => ({ id: crypto.randomUUID(), task, status: 'pending', error: null, owner: source }))]);
        setExtract({ status: 'done', note: '', source: source.text, owner: source });
      } else {
        setExtract({ status: res.state === 'preview' ? 'preview' : 'error', note: res.note || '', source: source.text, owner: source });
      }
    } catch (e) {
      if (!ownsRequest()) return;
      setExtract({ status: 'error', note: e?.message || '', source: source.text, owner: source });
    } finally {
      if (requestOwner.current === request) requestOwner.current = null;
    }
  };

  // 같은 원문 세대는 AI를 다시 부르거나 후보 id를 바꾸지 않고 펼친다.
  // 다른 원문을 추출해도 이미 동결한 명령과 결과 확인 경로는 보존한다.
  const reopen = () => { if (['done', 'loading'].includes(extract.status) && extract.owner === sourceOwner.current) setOpen(true); else return handleExtract(); };

  const handleAddTask = async (action) => {
    action = currentActions.current.find(item => item.id === action.id);
    if (!mounted.current || !action || (!action.command && action.owner !== sourceOwner.current)) return;
    if (action.status === 'sending' || action.status === 'saved') return;
    const frozen = freezeMemoAction(action, currentProject.current);
    patchAction(action.id, { command: frozen.command, status: 'sending', error: null });
    const outcome = await registerMemoAction(frozen);
    patchAction(action.id, outcome);
    if (mounted.current && outcome.status === 'saved') toast.success(`'${action.task}' 할 일로 등록됨`);
  };

  const currentExtract = extract.owner === sourceOwner.current;
  const visibleActions = actions.filter(action => action.command || (active && action.owner === sourceOwner.current));
  // Step changes hide fresh suggestions, never an already sent command's receipt
  // or same-payload retry. Keep this component mounted while the original edits.
  if (!active && !actions.some(action => action.command)) return null;
  if ((!text || text.trim().length < 10) && !actions.some(action => action.command)) return null;

  return (
    <div style={{ margin: "4px 0 8px" }}>
      {!open && active ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" size="xs" icon="sparkle" aria-expanded={false} onClick={reopen}>
            {!currentExtract ? "AI 액션 추출" : extract.status === 'done' ? "추출한 액션 보기" : extract.status === 'loading' ? "액션 추출 중…" : "AI 액션 추출"}
          </Button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-sm)",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
              <Iconed name="sparkle" size={12} style={{ color: "var(--fg-muted)" }} />
              {active ? '추출된 액션 아이템' : '할 일 등록 결과'}
            </span>
            {active && <Button type="button" variant="ghost" size="sm" aria-expanded={true} onClick={() => setOpen(false)}>접기</Button>}
          </div>

          {active && currentExtract && extract.status === 'loading' ? (
            <Skeleton lines={3} height={14} gap={6} label="메모에서 실행 과제 추출 중" />
          ) : active && currentExtract && (extract.status === 'preview' || extract.status === 'error') ? (
            <div role={extract.status === 'error' ? 'alert' : 'status'} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <TruthBadge state={extract.status} label={extract.status === 'preview' ? 'Preview · AI 연결 필요' : '추출 실패'} />
              <span style={{ color: "var(--fg-muted)" }}>
                {extract.status === 'preview' ? 'AI 엔진이 연결되지 않아 액션을 추출하지 않았어요. 연결한 뒤 다시 추출하세요.' : `액션을 추출하지 못했어요.${extract.note ? ` (${extract.note})` : ''}`}
              </span>
              <Button type="button" variant="outline" size="xs" onClick={handleExtract}>다시 추출</Button>
            </div>
          ) : null}
          {visibleActions.length > 0 ? (
            <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {visibleActions.map((action, i) => {
                const saved = action.status === 'saved';
                const sending = action.status === 'sending';
                const settled = TASK_OUTCOME[action.status];
                return (
                  <div
                    key={action.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 6,
                      background: "var(--surface-3)",
                      padding: "4px 8px",
                      borderRadius: "var(--r-xs)",
                    }}
                  >
                    <span style={{ flex: "1 1 160px", color: "var(--fg)", overflowWrap: "anywhere" }}>
                      {i + 1}. {action.task}
                    </span>
                    {settled && <TruthBadge state={settled.truth} label={settled.label} />}
                    <Button
                      type="button"
                      variant={saved ? "ghost" : "outline"}
                      size="xs"
                      disabled={saved || sending || (!action.command && action.owner !== sourceOwner.current)}
                      icon={saved ? "check" : "plus"}
                      onClick={() => handleAddTask(action)}
                    >
                      {saved ? "등록됨" : sending ? "등록 중…" : settled ? settled.retry : "할 일 등록"}
                    </Button>
                    {settled && action.error && <span style={{ flexBasis: "100%", color: "var(--fg-muted)", fontSize: 11 }}>{action.error}</span>}
                  </div>
                );
              })}
            </div>
          ) : currentExtract && extract.status === 'done' ? (
            <div style={{ color: "var(--fg-muted)" }}>추출된 실행 과제가 없습니다.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function MemoComposer({ model, isNew, onClose, onReload, focused = false }) {
  const { draft, entry, ready, locked, busy, dirty, pending, conflict, source, edit } = model;
  const [selection, setSelection] = React.useState(null), [helper, setHelper] = React.useState(Boolean(draft?.noteMeta.enhancement));
  const [pendingImport, setPendingImport] = React.useState(null), [importMessage, setImportMessage] = React.useState('');
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [requestedStep, setRequestedStep] = React.useState('review');
  // A pending request or edited original always stays in capture. Moving between
  // steps is presentation only; the journal writer still owns every save/retry.
  const step = !entry || dirty || pending || conflict ? 'capture' : requestedStep;
  const stepHeadingRef = React.useRef(null);
  const priorStep = React.useRef(step);
  const bodyRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const draftRef = React.useRef(draft);
  const importSerial = React.useRef(0);
  draftRef.current = draft;
  React.useEffect(() => () => { importSerial.current++; }, []);
  React.useEffect(() => { setPendingImport(null); setImportMessage(''); }, [draft?.id, draft?.expectedRevision]);
  React.useEffect(() => {
    if (ready && (step === 'capture' || priorStep.current !== step)) {
      (step === 'capture' ? bodyRef : stepHeadingRef).current?.focus();
    }
    priorStep.current = step;
  }, [ready, step]);
  React.useEffect(() => { setSelection(null); }, [draft?.body]);
  React.useEffect(() => { if (ready && draft?.noteMeta.enhancement) setHelper(true); }, [ready]);
  const question = NOTE_QUESTIONS.find((item) => item.value === draft?.noteMeta.kind) || NOTE_QUESTIONS[0];
  // 발췌를 직접 고르지 않아도 메모 전체를 활용할 수 있다. 서버 RPC(journal_note_command_v1)는
  // prefix+text+suffix가 원문과 정확히 같아야 받으므로 0~끝을 그대로 발췌로 만든다.
  // 3,500자를 넘거나 공백뿐이면 null이 돌아오고, 그때만 직접 선택이 필요하다.
  const wholeMemo = React.useMemo(() => selectedNoteExcerpt(draft?.body || '', 0, (draft?.body || '').length), [draft?.body]);
  const useExcerpt = selection || wholeMemo;
  const normalizedTags = normalizeJournalTags(draft?.noteMeta.tags);
  const invalidTags = normalizedTags === null;
  const canSave = Boolean(!invalidTags && ready && draft && dirty && !locked && !conflict && source === 'live');
  const canReview = Boolean(entry && !dirty && !locked && !pending && !conflict && source === 'live');
  const canUse = Boolean(entry && !dirty && !locked && source === 'live' && useExcerpt);
  const reviewDisabledReason = dirty ? '변경한 원문을 먼저 저장해 주세요.'
    : locked || conflict || pending ? '메모 저장 결과를 확인한 뒤 분석할 수 있어요.'
      : source !== 'live' ? '메모 저장소 연결을 확인해 주세요.' : null;
  const truth = busy ? 'syncing' : model.saveState === 'error' || conflict ? 'error' : model.saveState === 'saved' || (entry && !dirty && !pending) ? 'live' : 'preview';
  const truthLabel = busy ? '저장 중' : pending ? '저장 결과 확인 필요' : conflict ? '원문 변경 확인' : dirty ? '작성 중 · 서버 미저장' : entry ? '저장된 메모' : '아직 저장되지 않음';
  function selectionChanged(event) {
    setSelection(selectedNoteExcerpt(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd));
  }
  function copy() { navigator.clipboard.writeText([draft.body, draft.noteMeta.enhancement].filter(Boolean).join('\n\n')).catch(() => bodyRef.current?.select()); }
  function saveAndReview() {
    setRequestedStep('review');
    return model.save();
  }
  async function importTranscript(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || locked || !draft) return;
    const startingDraft = draft;
    const ticket = ++importSerial.current;
    try {
      const incoming = await readMemoFile(file);
      if (ticket !== importSerial.current) return;
      if (draftRef.current !== startingDraft) {
        setImportMessage('파일을 읽는 동안 원문이 바뀌었어요. 다시 가져오기를 선택해 주세요.');
        return;
      }
      if (draft.body.trim()) {
        setPendingImport({ incoming, draftId: draft.id, revision: draft.expectedRevision });
        setImportMessage('현재 원문이 있어요. 교체할지 확인해 주세요.');
      } else {
        edit({ body: incoming.body, title: draft.title || incoming.title });
        setImportMessage('전사문을 불러왔어요. 원문을 확인한 뒤 저장해 주세요.');
      }
    } catch (error) {
      if (ticket !== importSerial.current) return;
      setImportMessage(error instanceof Error ? error.message : '전사문을 읽지 못했어요.');
    }
  }
  function applyTranscriptImport() {
    if (!pendingImport || locked) return;
    if (pendingImport.draftId !== draft?.id || pendingImport.revision !== draft?.expectedRevision) {
      setPendingImport(null);
      setImportMessage('메모 저장본이 바뀌었어요. 전사문을 다시 가져와 주세요.');
      return;
    }
    edit({ body: pendingImport.incoming.body, title: draft.title || pendingImport.incoming.title });
    setPendingImport(null);
    setImportMessage('전사문으로 원문을 교체했어요. 확인한 뒤 저장해 주세요.');
  }
  // 본문에서 손을 떼지 않고 저장한다 — 빠른 메모·기록하기와 같은 ⌘/Ctrl + Enter 계약.
  function saveShortcut(event) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || !canSave) return;
    event.preventDefault();
    event.stopPropagation();
    saveAndReview();
  }
  const tagFields = draft ? <>
          <SelectField label="기록 범위" value={draft.noteMeta.scope || ''} disabled={locked}
            options={[{ value: '', label: '범위 미분류' }, { value: 'personal', label: '개인' }, { value: 'company', label: '회사 업무' }]}
            onChange={(event) => { const noteMeta = { ...draft.noteMeta }; if (event.target.value) noteMeta.scope = event.target.value; else delete noteMeta.scope; edit({ noteMeta }); }} />
          <TextField label="태그 · 선택" placeholder="쉼표로 구분해 입력" value={(draft.noteMeta.tags || []).join(',')} disabled={locked}
            hint={`최대 ${JOURNAL_TAG_LIMIT}개 · 태그당 ${JOURNAL_TAG_LENGTH}자 · 검색으로 다시 찾을 수 있어요.`}
            error={invalidTags ? `태그는 ${JOURNAL_TAG_LIMIT}개까지, 각 ${JOURNAL_TAG_LENGTH}자 이내로 입력해 주세요.` : undefined}
            onChange={(event) => edit({ noteMeta: { ...draft.noteMeta, tags: event.target.value.split(',') } })} />
          {normalizedTags?.length > 0 && <ul className="memo-tag-chips" aria-label="입력한 태그">{normalizedTags.map(tag => <li key={tag}>
            <span>#{tag}</span><Button size="xs" disabled={locked} aria-label={`${tag} 태그 삭제`}
              onClick={() => edit({ noteMeta: { ...draft.noteMeta, tags: normalizedTags.filter(value => value !== tag) } })}>×</Button>
          </li>)}</ul>}
  </> : null;
  return <Drawer title={isNew && !entry ? '메모 남기기' : '메모'} subtitle="원문 저장 → 검토 → 다음 행동" presentation={isNew && !entry ? 'compact' : 'side'} width="min(620px, 96vw)" initialFocusRef={bodyRef} onClose={() => { if (!busy) onClose(); }}
    footer={<div className={`memo-footer${focused ? ' memo-footer--focused' : ''}`}>
      {/* 단축키는 §8.1대로 실행 버튼 옆 Kbd 한 칸으로 알린다 — 모바일에서 안내문을 한 줄 더 늘리지 않는다. */}
      {step === 'capture' ? <Button variant="primary" disabled={!canSave} onClick={saveAndReview}>{busy ? '저장 중…' : entry ? '수정 저장' : '메모 저장'} <Kbd>⌘↵</Kbd></Button>
        : step === 'review' ? <Button variant="primary" disabled={!canReview} onClick={() => setRequestedStep('next')}>다음 행동 선택</Button>
          : <Button variant="outline" onClick={() => setRequestedStep('review')}>원문 검토로</Button>}
      {step === 'capture' && canReview ? <Button variant="outline" onClick={() => setRequestedStep('review')}>저장된 원문 검토</Button>
        : step !== 'capture' ? <Button variant="ghost" onClick={onClose}>메모로 남겨두기</Button>
          : <span className="memo-muted">{pending ? '이전 요청을 먼저 확인해 주세요' : focused ? '이 탭에서 다시 열어 이어 쓸 수 있어요.' : '이 탭에서 다시 열거나 새로고침해도 이어 쓸 수 있어요'}</span>}
    </div>}>
    <div className="memo-composer memo-stack" onKeyDown={saveShortcut} data-focused={focused}>
      {/* 로딩은 한 줄 문구가 아니라 들어올 레이아웃(본문 · 보조 줄)을 예고한다 — DESIGN §11. */}
      {!ready ? <Skeleton lines={4} height={16} width={['32%', '100%', '100%', '58%']} gap={10} label="메모 불러오는 중" /> : !draft ? <div role="alert"><p>{model.loadError}</p><Button onClick={onReload}>다시 불러오기</Button></div> : <>
        <ol className="memo-flow-steps" aria-label="메모 순서">
          {[['capture', '1', '원문 저장'], ['review', '2', '검토'], ['next', '3', '다음 행동']].map(([value, number, label]) => <li key={value}>
            <Button variant="ghost" aria-current={step === value ? 'step' : undefined} disabled={value !== 'capture' && !canReview} onClick={() => setRequestedStep(value)}><span className="num" aria-hidden="true">{number}</span>{label}</Button>
          </li>)}
        </ol>
        <h3 ref={stepHeadingRef} tabIndex={-1} className="memo-flow-heading">{step === 'capture' ? '원문부터 남기세요' : step === 'review' ? '저장된 원문을 확인하세요' : '어디에 이어 쓸까요?'}</h3>
        <div aria-live="polite"><TruthBadge state={truth} label={truthLabel} /></div>
        {source !== 'live' && <div className="memo-feedback"><TruthBadge state={source} /><p>저장소를 확인한 뒤 서버에 저장할 수 있어요.</p><Button onClick={onReload} disabled={busy}>연결 다시 확인</Button><Button onClick={copy}>입력 복사</Button></div>}
        {model.localError && <div className="memo-feedback" role="alert"><p>이 탭의 복구 사본을 저장하지 못했어요. 입력을 복사해 보관해 주세요.</p><Button onClick={copy}>입력 복사</Button></div>}
        <div className="memo-flow-panel memo-stack fade-up" hidden={step === 'next'}>
        <TextAreaField ref={bodyRef} label={step === 'capture' ? '원문 메모' : '저장된 원문 · 읽기 전용'} readOnly={step !== 'capture'} placeholder="기억하고 싶은 일이나 떠오른 생각을 한 줄로…" value={draft.body} rows={isNew && !entry ? focused ? 5 : 3 : 9} style={isNew && !entry ? { minHeight: focused ? 160 : 80 } : undefined} maxLength={20000} disabled={locked} spacious showCount autoResize
          onChange={(event) => edit({ body: event.target.value })} onSelect={selectionChanged} hint={entry ? '일부만 쓰려면 문장을 선택하세요. 선택하지 않으면 메모 전체(3,500자까지)를 보냅니다.' : '제목이나 분류 없이 바로 저장할 수 있어요.'} />
        {step === 'review' && <div className="memo-actions"><Button variant="outline" onClick={() => setRequestedStep('capture')}>원문·연결 수정</Button><span className="memo-muted">다음 행동은 선택한 뒤에만 만들어요.</span></div>}
        </div>
        <div className="memo-flow-panel memo-stack fade-up" hidden={step !== 'capture'}>
        <div className="memo-actions">
          <input ref={fileRef} type="file" accept=".txt,text/plain" aria-label="전사 텍스트 파일 선택" style={{ display: 'none' }} onChange={importTranscript} />
          <Button type="button" variant="outline" size="xs" disabled={locked} onClick={() => fileRef.current?.click()}>전사 TXT 가져오기</Button>
          <span className="memo-muted">UTF-8 · 2만 자 이하 · 저장 전 확인</span>
        </div>
        {importMessage && <div className="memo-feedback" role={pendingImport ? 'alert' : 'status'}><p>{importMessage}</p>
          {pendingImport && <div className="memo-actions"><Button type="button" variant="outline" disabled={locked} onClick={applyTranscriptImport}>원문 교체</Button><Button type="button" variant="ghost" onClick={() => { setPendingImport(null); setImportMessage(''); }}>취소</Button></div>}
        </div>}
        <div className={focused ? 'memo-options' : 'memo-stack'}>
        <div className="memo-metadata">
          <MemoContextPicker selected={draft.contexts} onChange={(contexts) => edit({ contexts })} disabled={locked} label="프로젝트·고객·브랜드 연결" />
          {focused ? <details className="memo-details"><summary>분류 태그 <span className="memo-muted">선택</span></summary>{tagFields}</details> : tagFields}
        </div>
        <details className="memo-details"><summary>제목·시각 <span className="memo-muted">선택</span></summary><div className="memo-stack">
          <TextField label="제목" value={draft.title} maxLength={200} disabled={locked} onChange={(event) => edit({ title: event.target.value })} />
          <TextField label="기록 시각" type="datetime-local" value={localTime(draft.occurredAt)} disabled={locked} onChange={(event) => { const date = new Date(event.target.value); if (!Number.isNaN(date.getTime())) edit({ occurredAt: date.toISOString() }); }} />
        </div></details>
        </div>
        {entry && <section className="memo-section">
          <Button variant="outline" aria-expanded={helper} onClick={() => setHelper(!helper)}>한 줄 보강하기 <span className="memo-muted">선택</span></Button>
          {helper && <div className="memo-stack">
            <SelectField label="어떤 메모인가요?" options={NOTE_QUESTIONS} value={draft.noteMeta.kind} disabled={locked} onChange={(event) => edit({ noteMeta: { ...draft.noteMeta, kind: event.target.value } })} />
            <TextAreaField label={question.question} hint="직접 본 일과 내 해석을 구분해 적어보세요. 건너뛰어도 메모는 이미 저장되어 있어요." value={draft.noteMeta.enhancement} maxLength={4000} rows={3} disabled={locked} onChange={(event) => edit({ noteMeta: { ...draft.noteMeta, enhancement: event.target.value } })} />
          </div>}
        </section>}
        </div>
        {conflict && <section className="memo-feedback" aria-label="메모 변경 비교"><p>다른 창에서 이 메모를 수정했어요. 내 입력은 위에 남아 있어요.</p>
          <details><summary>현재 저장본 보기</summary><pre>{conflict.body}</pre>{conflict.noteMeta?.enhancement && <p>{conflict.noteMeta.enhancement}</p>}{conflict.noteMeta?.tags?.length > 0 && <p>태그 · {conflict.noteMeta.tags.join(', ')}</p>}</details>
          <div className="memo-actions"><Button disabled={locked} onClick={() => model.chooseConflict(false)}>현재 저장본 사용</Button><Button variant="outline" disabled={locked} onClick={() => model.chooseConflict(true)}>내 입력 이어서 수정</Button></div>
        </section>}
        {model.message && <div className="memo-feedback" role={model.saveState === 'error' ? 'alert' : 'status'}><p>{model.message}</p>
          {pending && <Button variant="outline" disabled={busy || !model.workspaceConfirmed || model.source === 'loading'} onClick={model.retry}>이전 요청 결과 확인</Button>}
          {model.target && <Link className="memo-target-link hub-row" href={model.target.href}>{model.target.type === 'task' ? '만든 할 일 열기' : '콘텐츠 스튜디오 열기'} →</Link>}
        </div>}
        {entry && <div className="memo-flow-panel memo-stack fade-up" hidden={step !== 'review'}>
        <GoalLinks entityType="journal_entries" entityId={entry.id} />
        <section className="memo-section"><Button variant="outline" type="button" aria-expanded={reviewOpen}
          onClick={() => setReviewOpen((value) => !value)}>회의 내용 AI 정리 · 근거 검토 <span className="memo-muted">선택</span></Button>
          {reviewOpen && <MeetingReviewController key={`${entry.id}:${entry.revision}`} entry={entry} disabledReason={reviewDisabledReason} onApplied={onReload} />}
        </section></div>}
        <div className="memo-flow-panel memo-stack fade-up" hidden={step !== 'next'}>
        {entry && <section className="memo-section"><h3>다음 행동으로 잇기</h3>
          <p className="memo-muted">{dirty ? '변경 내용을 저장한 뒤 이어서 쓸 수 있어요.'
            : selection ? '선택한 발췌와 원문 링크만 전달됩니다.'
            : wholeMemo ? '메모 전체를 보내거나, 원문 검토에서 일부 문장을 선택할 수 있어요.'
            : '메모가 길어요. 원문 검토에서 보낼 문장을 3,500자 이내로 선택해 주세요.'}</p>
          {selection && <blockquote className="memo-selection">{selection.text}</blockquote>}
          <Button variant="ghost" onClick={() => setRequestedStep('review')}>원문에서 발췌 선택</Button>
          <div className="memo-actions"><Button variant="outline" disabled={!canUse} onClick={() => model.prepareUse('create_task', useExcerpt)}>{selection ? '발췌를 할 일로' : '메모 전체를 할 일로'}</Button><Button variant="outline" disabled={!canUse} onClick={() => model.prepareUse('create_content', useExcerpt)}>{selection ? '발췌를 콘텐츠로' : '메모 전체를 콘텐츠로'}</Button></div>
        </section>}
        {entry?.links?.length > 0 && <section className="memo-section"><h3>이 메모를 사용한 곳</h3><ul className="memo-uses">{entry.links.map((link) => <li key={link.id}>
          <Link href={link.href} className="hub-row">{link.targetType === 'task' ? '할 일' : '콘텐츠'} · {link.title}</Link>
          <span className="memo-muted mono">{memoTime(link.createdAt)} · {link.sourceRevision === entry.revision ? '현재 원문에서 사용' : `이전 원문 v${link.sourceRevision}에서 사용`}</span>
          <details><summary>사용한 발췌</summary><blockquote>{link.excerpt}</blockquote></details>
        </li>)}</ul></section>}
        </div>
        {!focused && <MemoActionExtractor text={draft.body} contexts={draft.contexts} active={step === 'next'} />}
      </>}
    </div>
  </Drawer>;
}
