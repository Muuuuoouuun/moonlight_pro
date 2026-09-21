"use client";
import React from 'react';
import { Button, EmptyState, SelectField, Skeleton, TextAreaField, TextField, TruthBadge } from './hub-primitives';
import { candidateReviewDraft, candidateReviewInput, classifyAssistanceResult, copyCandidateOutput, readCompleteCandidate } from '@/lib/ai-review-client';
import { readGoalLocal, writeGoalLocal } from '@/lib/goal-client';
import './goal-assistance.css';

const OPERATIONS = [{ value: 'draft', label: '초안 작성' }, { value: 'rewrite', label: '표현 개선' }, { value: 'critique', label: '품질 검토' }, { value: 'analyze', label: '근거 분석' }];
const SCOPES = [{ value: 'personal', label: '개인' }, { value: 'company', label: '회사' }];
const REVIEW = [{ value: 'accepted', label: '채택' }, { value: 'edited', label: '수정 후 채택' }, { value: 'rejected', label: '폐기' }];
const scopeOf = value => ['company', 'classin'].includes(value) ? 'company' : 'personal';
const endpoint = '/api/hub/ai-assistance';
const errorCopy = value => ({ 'source-conflict': '원문이 바뀌었습니다. 입력은 그대로 두고 최신 근거를 확인해주세요.', 'scope-mismatch': '이 업무의 개인·회사 범위를 다시 선택해주세요.', 'source-too-large': '원문이 길어 이 패널에서 다룰 수 없습니다. Studio에서 필요한 부분을 선택해주세요.', 'candidate-conflict': '검토 기록이 바뀌었습니다. 최신 후보를 확인해주세요.', 'receipt-unavailable': '저장소 연결을 확인하지 못했습니다. 같은 요청을 확인해주세요.' }[value] || '요청을 마치지 못했습니다. 입력을 보존했습니다. 연결과 같은 요청의 상태를 확인해주세요.');

export function GoalAssistancePanel({ entityType, entityId, scope }) {
  const [open, setOpen] = React.useState(false), [opened, setOpened] = React.useState(false);
  if (!['tasks', 'projects', 'content_items'].includes(entityType) || !entityId) return null;
  return <section className="goal-assistance" aria-label="AI 초안과 검토">
    <Button variant="outline" onClick={() => { setOpened(true); setOpen(value => !value); }} aria-expanded={open}>AI로 초안·검토 {open ? '접기' : '열기'}</Button>
    {opened && <div hidden={!open}><AssistanceEditor key={`${entityType}:${entityId}`} entityType={entityType} entityId={entityId} initialScope={scopeOf(scope)} /></div>}
  </section>;
}

function AssistanceEditor({ entityType, entityId, initialScope }) {
  const [scope, setScope] = React.useState(initialScope), [operation, setOperation] = React.useState('draft');
  const [instruction, setInstruction] = React.useState(''), [output, setOutput] = React.useState('');
  const [client, setClient] = React.useState('manual'), [external, setExternal] = React.useState(false);
  const [data, setData] = React.useState({ status: 'loading', candidates: [] });
  const [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false), [pending, setPending] = React.useState(null);
  const active = React.useRef(true), inFlight = React.useRef(false), requestRef = React.useRef(null), loadSequence = React.useRef(0);
  const uncertain = React.useRef(false);
  const storageKey = `moonlight:assist:${entityType}:${entityId}`;
  const refresh = React.useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ entityType, entityId, scope })}`, { cache: 'no-store' });
      const value = await response.json();
      if (active.current && sequence === loadSequence.current) setData(value && typeof value.status === 'string' ? value : { status: 'error', candidates: [] });
    } catch { if (active.current && sequence === loadSequence.current) setData({ status: 'error', candidates: [] }); }
  }, [entityType, entityId, scope]);
  React.useEffect(() => {
    active.current = true;
    try { const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (stored?.commandId) {
      requestRef.current = stored; uncertain.current = true; setPending(stored);
      if (stored.input?.scope) setScope(stored.input.scope);
      if (stored.input?.operation) setOperation(stored.input.operation);
      if (typeof stored.input?.instruction === 'string') setInstruction(stored.input.instruction);
      if (typeof stored.input?.output === 'string') { setOutput(stored.input.output); setExternal(true); }
      if (stored.input?.client) setClient(stored.input.client);
      setMessage('아직 결과를 확인하지 않은 요청이 있습니다. 같은 요청부터 확인해주세요.');
    } } catch {}
    return () => { active.current = false; };
  }, [storageKey]);
  React.useEffect(() => { setData({ status: 'loading', candidates: [] }); refresh(); }, [refresh]);
  function keepRequest(command) { requestRef.current = command; setPending(command); try { sessionStorage.setItem(storageKey, JSON.stringify(command)); } catch {} }
  function clearRequest() { requestRef.current = null; uncertain.current = false; setPending(null); try { sessionStorage.removeItem(storageKey); } catch {} }
  async function dispatch(command, receiptOnly = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(receiptOnly ? `${endpoint}?commandId=${command.commandId}` : endpoint, receiptOnly ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command.recoveryToken ? { commandId: command.commandId, action: 'recover_candidate', input: { recoveryToken: command.recoveryToken } } : command) });
      const result = await response.json();
      const outcome = classifyAssistanceResult(response, result, command, { receiptOnly, uncertain: uncertain.current });
      if (outcome === 'pending' || outcome === 'unsaved') uncertain.current = true;
      // The request can outlive its drawer. Preserve a paid result before touching React state.
      if (outcome === 'unsaved') {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ ...command, recoveryToken: result.recoveryToken || command.recoveryToken || null, recoveryOutput: result.output, recoveryOutputTruncated: result.outputTruncated === true })); } catch {}
      }
      if (!active.current) return;
      if (outcome === 'unsaved') {
        keepRequest({ ...command, recoveryToken: result.recoveryToken || command.recoveryToken || null, recoveryOutput: result.output, recoveryOutputTruncated: result.outputTruncated === true });
        setMessage('후보는 생성됐지만 저장을 확인하지 못했습니다. 아래 결과를 이 브라우저에 보존했습니다. 추가 생성 없이 저장만 복구할 수 있습니다.');
      } else if (outcome === 'saved') {
        clearRequest(); setMessage(command.action === 'review_candidate' ? '검토 결과를 저장했습니다.' : '후보를 저장했습니다. 원문에 적용하거나 발송한 상태는 아닙니다.');
        if (command.action === 'save_candidate') setOutput('');
        await refresh();
      } else if (outcome === 'pending') {
        setMessage('결과가 아직 확인되지 않았습니다. 새 생성 전에 같은 요청의 상태를 확인해주세요.');
      } else {
        if (command.recoveryOutput) { setOutput(command.recoveryOutput); setExternal(true); setClient('manual'); }
        clearRequest(); setMessage(errorCopy(result.error)); await refresh();
      }
      return result;
    } catch { uncertain.current = true; if (active.current) setMessage('응답이 끊겼습니다. 입력과 요청을 보존했으니 같은 요청을 확인해주세요.'); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  function submit(action, input) {
    if (inFlight.current || requestRef.current || busy || pending) return;
    uncertain.current = false;
    const command = { commandId: crypto.randomUUID(), action, input }; keepRequest(command); return dispatch(command);
  }
  const ready = ['live', 'partial'].includes(data.status) && data.sourceUpdatedAt && !data.failedSources?.includes('operating_ai_candidates');
  const locked = busy || Boolean(pending);
  const candidates = data.candidates || [];
  return <div className="assist-editor">
    <div className="assist-heading"><h4>저장된 근거로 초안·검토</h4><TruthBadge state={['live', 'partial', 'preview', 'error'].includes(data.status) ? data.status : 'loading'} /></div>
    <p className="assist-muted">업무 원문과 연결된 목표·지표를 참고합니다. 초안의 채택과 실제 업무 완료는 따로 기록합니다.</p>
    <div className="assist-fields"><SelectField label="업무 범위" value={scope} options={SCOPES} disabled={locked} onChange={event => setScope(event.target.value)} /><SelectField label="도움받을 작업" value={operation} options={OPERATIONS} disabled={locked} onChange={event => setOperation(event.target.value)} /></div>
    {data.status === 'loading' ? <Skeleton lines={3} height={14} label="AI 작업 근거 불러오는 중" /> : !ready ? <EmptyState title="작업 근거를 확인해주세요" description={data.error === 'scope-mismatch' ? errorCopy(data.error) : '원문과 후보 저장소가 연결되어야 사용할 수 있습니다.'} action={<Button onClick={refresh} disabled={busy}>다시 확인</Button>} /> : <>
      <details className="assist-source"><summary>참고한 원문·목표 확인</summary><pre>{data.snapshot?.title || data.snapshot?.name}{'\n'}{data.snapshot?.description || data.snapshot?.summary || data.snapshot?.source_idea || ''}{'\n'}{data.snapshot?.next_action || ''}</pre><p className="assist-muted mono">원문 기준 {data.sourceUpdatedAt}</p>{data.goals?.objectives?.map(item => <p key={item.id}>{item.title} · {item.periodStart}–{item.periodEnd}</p>)}{data.goals?.metrics?.map(item => <p key={item.id}>{item.name} · {item.measurement?.value == null ? '미측정' : `${item.measurement.value} ${item.unit || ''}`}</p>)}{data.status === 'partial' && <p>목표 또는 측정 근거에 공백이 있습니다. 해당 부분은 확인 필요로 다룹니다.</p>}{entityType === 'content_items' && <p className="assist-muted">저장된 콘텐츠 원문 기준입니다. 채널별 초안 편집은 Studio에서 계속합니다.</p>}</details>
      <TextAreaField label="도움받고 싶은 내용" value={instruction} onChange={event => setInstruction(event.target.value)} disabled={locked} maxLength={4000} placeholder="원문을 바탕으로 다음 고객 연락 초안을 써줘. 확인할 사항을 따로 표시해줘." />
      <div className="assist-actions"><Button variant="primary" disabled={locked} onClick={() => submit('generate', { entityType, entityId, scope, expectedSourceUpdatedAt: data.sourceUpdatedAt, operation, instruction })}>{busy ? '처리 중' : 'Gemini로 후보 만들기'}</Button><Button disabled={locked} onClick={() => setExternal(value => !value)} aria-expanded={external}>다른 AI·직접 쓴 후보 저장</Button></div>
      <p className="assist-muted">Gemini 생성은 설정된 API 사용량을 사용합니다.</p>
      {external && <div className="assist-external"><SelectField label="후보를 만든 도구" value={client} onChange={event => setClient(event.target.value)} disabled={locked} options={[{ value: 'manual', label: '직접 작성' }, { value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude' }, { value: 'antigravity', label: 'Antigravity' }]} /><TextAreaField label="저장할 후보" value={output} onChange={event => setOutput(event.target.value)} disabled={locked} maxLength={24000} /><Button variant="outline" disabled={locked || !output.trim()} onClick={() => submit('save_candidate', { entityType, entityId, scope, expectedSourceUpdatedAt: data.sourceUpdatedAt, operation, instruction, output, client })}>후보 저장</Button></div>}
    </>}
    {message && <p className="assist-message" role="status">{message}</p>}
    {pending?.recoveryOutput && <article className="assist-candidate"><strong>생성됨 · 서버 저장 미확인</strong><pre tabIndex={0} aria-label="보존된 미저장 AI 후보">{pending.recoveryOutput}</pre>{pending.recoveryOutputTruncated && <p>긴 결과의 일부를 표시합니다. 저장 복구 뒤 전체를 읽을 수 있습니다.</p>}{pending.recoveryToken && <Button variant="primary" disabled={busy} onClick={() => dispatch(requestRef.current)}>다시 생성하지 않고 저장 복구</Button>}</article>}
    {pending && <div className="assist-actions"><Button disabled={busy} onClick={() => dispatch(requestRef.current, true)}>같은 요청 확인</Button><Button disabled={busy} onClick={() => dispatch(requestRef.current)}>같은 요청 재전송</Button><span className="assist-muted mono">{pending.commandId}</span></div>}
    {candidates.map(candidate => <CandidateReview key={candidate.id} candidate={candidate} locked={locked} onReview={input => submit('review_candidate', input)} />)}
    {ready && !candidates.length && <p className="assist-muted">아직 저장한 후보가 없습니다.</p>}
    {candidates.length > 0 && <p className="assist-muted">최근 후보 최대 3개를 표시합니다. 새 후보는 기존 원문을 덮어쓰지 않습니다.</p>}
  </div>;
}

function CandidateReview({ candidate, locked, onReview }) {
  const [open, setOpen] = React.useState(false);
  const draftKey = `assist-review:${candidate.id}`;
  const [draft, setDraft] = React.useState(() => {
    const initial = candidateReviewDraft(candidate), saved = readGoalLocal(draftKey);
    return saved?.dirty && Number.isInteger(saved.revision) && ['outcome', 'baselineMinutes', 'reviewMinutes', 'actualMinutes', 'note'].every(key => typeof saved[key] === 'string') ? saved : initial;
  });
  const [notice, setNotice] = React.useState(''), [reviewing, setReviewing] = React.useState('');
  const [visibleOutput, setVisibleOutput] = React.useState(candidate.output || ''), [nextOffset, setNextOffset] = React.useState(candidate.nextOffset ?? null);
  const [reading, setReading] = React.useState(false), [copying, setCopying] = React.useState(false), [readMessage, setReadMessage] = React.useState('');
  const reviewInFlight = React.useRef(false), outputInFlight = React.useRef(false);
  const detailsId = React.useId();
  function updateDraft(update) {
    setDraft(previous => { const next = typeof update === 'function' ? update(previous) : update; writeGoalLocal(draftKey, next.dirty ? next : null); return next; });
  }
  React.useEffect(() => { updateDraft(previous => candidateReviewDraft(candidate, previous)); }, [candidate.revision]);
  React.useEffect(() => { setVisibleOutput(candidate.output || ''); setNextOffset(candidate.nextOffset ?? null); }, [candidate.outputHash]);
  const change = (field, value) => updateDraft(previous => ({ ...previous, [field]: value, dirty: true, outcomeDirty: field === 'outcome' || previous.outcomeDirty }));
  let detailInput = null, validation = '';
  try { detailInput = candidateReviewInput(candidate, draft.outcome, draft); } catch (error) { validation = error.message; }
  const staleDraft = draft.dirty && draft.revision !== candidate.revision;
  async function record(outcome, details = false) {
    if (locked || reviewInFlight.current || details && (!detailInput || staleDraft)) return;
    reviewInFlight.current = true; setReviewing(details ? 'details' : outcome); setNotice('');
    try {
      const result = await onReview(details ? detailInput : candidateReviewInput(candidate, outcome));
      if (result?.status === 'saved' && result.persisted === true && result.candidate) {
        updateDraft(previous => details ? candidateReviewDraft(result.candidate) : candidateReviewDraft(result.candidate, previous, true));
        setNotice(`${REVIEW.find(item => item.value === outcome)?.label || '검토 결과'} 기록을 저장했습니다. 원문은 그대로입니다.`);
        if (details) setOpen(false);
      }
    } finally { reviewInFlight.current = false; setReviewing(''); }
  }
  async function readOrCopy(copy) {
    if (outputInFlight.current) return;
    outputInFlight.current = true; setReading(true); setCopying(copy); setReadMessage('');
    const source = { ...candidate, output: visibleOutput, nextOffset };
    const options = { onPage: page => { setVisibleOutput(page.output); setNextOffset(page.nextOffset); } };
    try {
      const complete = copy ? await copyCandidateOutput(source, options) : await readCompleteCandidate(source, options);
      setVisibleOutput(complete); setNextOffset(null);
      setReadMessage(copy ? '전체 후보를 복사했습니다.' : '전체 후보를 불러왔습니다.');
    } catch {
      setReadMessage(copy ? '복사하지 못했습니다. 전체 후보를 확인한 뒤 다시 시도하거나 본문을 선택해 복사하세요.' : '남은 후보를 확인하지 못했습니다. 표시된 내용은 보존했습니다.');
    } finally { outputInFlight.current = false; setReading(false); setCopying(false); }
  }
  const busy = locked || Boolean(reviewing);
  return <article className="assist-candidate">
    <div className="assist-heading"><strong>{OPERATIONS.find(item => item.value === candidate.operation)?.label || 'AI 후보'}</strong><span className="assist-muted">{candidate.provider === 'gemini' ? 'Gemini 생성' : candidate.client || '직접 저장'}</span></div>
    {candidate.stale && <p className="assist-message">후보를 만든 뒤 원문이 바뀌었습니다. 적용 전에 최신 원문을 확인해주세요.</p>}
    {candidate.output ? <pre tabIndex={0} aria-label="저장된 AI 후보">{visibleOutput}</pre> : <p>생성 상태: {candidate.status === 'running' ? '확인 중' : candidate.status === 'unknown' ? '결과 미확인' : '생성하지 못함'}</p>}
    {candidate.output && <>
      <div className="assist-actions assist-review-decisions" aria-label="후보 검토 결과 기록">
        {REVIEW.map(item => <Button key={item.value} variant="outline" disabled={busy} onClick={() => record(item.value)}>{reviewing === item.value ? '기록 중…' : item.value === 'accepted' ? '채택 기록' : item.value === 'rejected' ? '폐기 기록' : '수정 후 채택'}</Button>)}
      </div>
      {candidate.review && <p className="assist-muted assist-review-summary">저장된 검토: {REVIEW.find(item => item.value === candidate.review.outcome)?.label} · {candidate.timeSavedMinutes == null ? '시간 차이 미측정' : `작업 시간 차이 ${candidate.timeSavedMinutes}분`}</p>}
      {notice && <p className="assist-muted" role="status">{notice}</p>}
      <div className="assist-actions assist-candidate-tools">
        <Button disabled={reading} onClick={() => readOrCopy(true)}>{copying ? '복사 준비 중…' : '후보 복사'}</Button>
        {nextOffset !== null && <Button disabled={reading} onClick={() => readOrCopy(false)}>{reading && !copying ? '후보 읽는 중…' : '전체 후보 읽기'}</Button>}
        <Button disabled={busy} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}>시간·메모 {open ? '접기' : '추가'}{draft.dirty ? ' · 작성 중' : ''}</Button>
      </div>
    </>}
    {readMessage && <p className="assist-muted" role="status">{readMessage}</p>}
    {open && <form id={detailsId} className="assist-review" onSubmit={event => { event.preventDefault(); record(draft.outcome, true); }}>
      <p className="assist-muted">시간과 메모는 선택입니다. 위의 빠른 기록은 저장된 값을 유지하고, 작성 중인 내용은 아래에서 따로 저장합니다.</p>
      <SelectField label="후보 검토 결과" options={[{ value: '', label: '검토 결과 선택' }, ...REVIEW]} value={draft.outcome} onChange={event => change('outcome', event.target.value)} disabled={busy} required />
      <TextAreaField label="검토 메모 · 선택" value={draft.note} maxLength={2000} onChange={event => change('note', event.target.value)} disabled={busy} />
      <div className="assist-fields">
        <TextField label="기존 방식 기준 시간 (분)" type="number" min="0" max="10080" value={draft.baselineMinutes} onChange={event => change('baselineMinutes', event.target.value)} disabled={busy} placeholder="모르면 비워두기" />
        <TextField label="후보 검토 시간 (분)" type="number" min="0" max="10080" value={draft.reviewMinutes} onChange={event => change('reviewMinutes', event.target.value)} disabled={busy} />
        <TextField label="그 외 작업 시간 (분)" type="number" min="0" max="10080" value={draft.actualMinutes} onChange={event => change('actualMinutes', event.target.value)} disabled={busy} />
      </div>
      <p className="assist-muted">그 외 작업 시간에는 요청 작성·실행·수정을 포함하고 후보 검토 시간은 제외합니다. 차이는 기준 − 검토 − 그 외 작업 시간이며 전체 절감 효과는 아닙니다. 모르는 시간은 비워둡니다.</p>
      {staleDraft && <div className="assist-message" role="status"><p>저장된 검토가 바뀌었습니다. 작성 중인 입력은 유지했습니다.</p><p>현재 메모: {candidate.review?.note || '없음'} · 기준 {candidate.review?.baselineMinutes ?? '미측정'}분 · 검토 {candidate.review?.reviewMinutes ?? '미측정'}분 · 그 외 {candidate.review?.actualMinutes ?? '미측정'}분</p><Button disabled={busy} onClick={() => updateDraft(previous => ({ ...previous, revision: candidate.revision }))}>현재 기록을 확인했고 내 입력 유지</Button></div>}
      {validation && draft.dirty && <p className="assist-muted" role="status">{validation}</p>}
      <div className="assist-actions"><Button type="submit" variant="outline" disabled={busy || !detailInput || staleDraft}>{reviewing === 'details' ? '저장 중…' : '시간·메모 저장'}</Button><Button disabled={busy} onClick={() => setOpen(false)}>닫기</Button></div>
    </form>}
  </article>;
}
