"use client";
import React from 'react';
import { Button, EmptyState, SelectField, Skeleton, TextAreaField, TextField, TruthBadge } from './hub-primitives';
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
      requestRef.current = stored; setPending(stored);
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
  function clearRequest() { requestRef.current = null; setPending(null); try { sessionStorage.removeItem(storageKey); } catch {} }
  async function dispatch(command, receiptOnly = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(receiptOnly ? `${endpoint}?commandId=${command.commandId}` : endpoint, receiptOnly ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command.recoveryToken ? { commandId: command.commandId, action: 'recover_candidate', input: { recoveryToken: command.recoveryToken } } : command) });
      const result = await response.json();
      // The request can outlive its drawer. Preserve a paid result before touching React state.
      if (result.status === 'unsaved' && result.output) {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ ...command, recoveryToken: result.recoveryToken || command.recoveryToken || null, recoveryOutput: result.output, recoveryOutputTruncated: result.outputTruncated === true })); } catch {}
      }
      if (!active.current) return;
      if (result.status === 'unsaved' && result.output) {
        keepRequest({ ...command, recoveryToken: result.recoveryToken || command.recoveryToken || null, recoveryOutput: result.output, recoveryOutputTruncated: result.outputTruncated === true });
        setMessage('후보는 생성됐지만 저장을 확인하지 못했습니다. 아래 결과를 이 브라우저에 보존했습니다. 추가 생성 없이 저장만 복구할 수 있습니다.');
      } else if (['saved', 'generated'].includes(result.status) && result.persisted === true) {
        clearRequest(); setMessage(command.action === 'review_candidate' ? '검토 결과를 저장했습니다.' : '후보를 저장했습니다. 원문에 적용하거나 발송한 상태는 아닙니다.');
        if (command.action === 'save_candidate') setOutput('');
        await refresh();
      } else if (['running', 'unknown'].includes(result.status) || result.persisted === null) {
        setMessage('결과가 아직 확인되지 않았습니다. 새 생성 전에 같은 요청의 상태를 확인해주세요.');
      } else {
        if (command.recoveryOutput) { setOutput(command.recoveryOutput); setExternal(true); setClient('manual'); }
        clearRequest(); setMessage(errorCopy(result.error)); await refresh();
      }
    } catch { if (active.current) setMessage('응답이 끊겼습니다. 입력과 요청을 보존했으니 같은 요청을 확인해주세요.'); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  function submit(action, input) {
    if (busy || pending) return;
    const command = { commandId: crypto.randomUUID(), action, input }; keepRequest(command); dispatch(command);
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
    {candidates.map(candidate => <CandidateReview key={`${candidate.id}:${candidate.revision}`} candidate={candidate} locked={locked} onReview={input => submit('review_candidate', input)} />)}
    {ready && !candidates.length && <p className="assist-muted">아직 저장한 후보가 없습니다.</p>}
    {candidates.length > 0 && <p className="assist-muted">최근 후보 최대 3개를 표시합니다. 새 후보는 기존 원문을 덮어쓰지 않습니다.</p>}
  </div>;
}

function CandidateReview({ candidate, locked, onReview }) {
  const [open, setOpen] = React.useState(false), [outcome, setOutcome] = React.useState(candidate.review?.outcome || 'accepted');
  const [baseline, setBaseline] = React.useState(candidate.review?.baselineMinutes ?? ''), [review, setReview] = React.useState(candidate.review?.reviewMinutes ?? ''), [actual, setActual] = React.useState(candidate.review?.actualMinutes ?? '');
  const [note, setNote] = React.useState(candidate.review?.note || '');
  const [visibleOutput, setVisibleOutput] = React.useState(candidate.output || ''), [nextOffset, setNextOffset] = React.useState(candidate.nextOffset ?? null), [reading, setReading] = React.useState(false), [readError, setReadError] = React.useState('');
  async function readRemaining() {
    if (reading || nextOffset === null) return;
    setReading(true); setReadError('');
    let offset = nextOffset;
    try {
      while (offset !== null) {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ candidateId: candidate.id, offset: String(offset), outputHash: candidate.outputHash })}`, { cache: 'no-store' });
        const page = await response.json();
        if (!response.ok || page.status !== 'live' || page.outputHash !== candidate.outputHash || typeof page.candidate?.output !== 'string' || page.nextOffset !== null && page.nextOffset <= offset) throw new Error();
        setVisibleOutput(value => value + page.candidate.output); offset = page.nextOffset; setNextOffset(offset);
      }
    } catch { setReadError('남은 후보를 읽지 못했습니다. 표시된 내용은 보존했습니다.'); }
    finally { setReading(false); }
  }
  const minutes = value => value === '' ? null : Number(value);
  const valid = [baseline, review, actual].every(value => value === '' || Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10080);
  return <article className="assist-candidate">
    <div className="assist-heading"><strong>{OPERATIONS.find(item => item.value === candidate.operation)?.label || 'AI 후보'}</strong><span className="assist-muted">{candidate.provider === 'gemini' ? 'Gemini 생성' : candidate.client || '직접 저장'}</span></div>
    {candidate.stale && <p className="assist-message">후보를 만든 뒤 원문이 바뀌었습니다. 적용 전에 최신 원문을 확인해주세요.</p>}
    {candidate.output ? <pre tabIndex={0} aria-label="저장된 AI 후보">{visibleOutput}</pre> : <p>생성 상태: {candidate.status === 'running' ? '확인 중' : candidate.status === 'unknown' ? '결과 미확인' : '생성하지 못함'}</p>}
    {nextOffset !== null && <Button disabled={reading} onClick={readRemaining}>{reading ? '후보 읽는 중' : '전체 후보 읽기'}</Button>}{readError && <p role="status">{readError}</p>}
    <div className="assist-actions">{candidate.output && <Button disabled={locked} aria-expanded={open} onClick={() => setOpen(value => !value)}>검토·시간 기록</Button>}{candidate.review && <span className="assist-muted">{REVIEW.find(item => item.value === candidate.review.outcome)?.label} · {candidate.timeSavedMinutes == null ? '시간 차이 미측정' : `작업 시간 차이 ${candidate.timeSavedMinutes}분`}</span>}</div>
    {open && <div className="assist-review"><SelectField label="후보 검토 결과" options={REVIEW} value={outcome} onChange={event => setOutcome(event.target.value)} disabled={locked} /><div className="assist-fields"><TextField label="기존 방식 기준 시간 (분)" type="number" min="0" max="10080" value={baseline} onChange={event => setBaseline(event.target.value)} disabled={locked} placeholder="모르면 비워두기" /><TextField label="후보 검토 시간 (분)" type="number" min="0" max="10080" value={review} onChange={event => setReview(event.target.value)} disabled={locked} /><TextField label="그 외 작업 시간 (분)" type="number" min="0" max="10080" value={actual} onChange={event => setActual(event.target.value)} disabled={locked} /></div><p className="assist-muted">그 외 작업 시간에는 요청 작성·실행·수정을 포함하고 후보 검토 시간은 제외합니다. 차이는 기준 − 검토 − 그 외 작업 시간이며, 시스템 구축·유지 비용을 포함한 전체 절감 효과는 아닙니다. 모르는 시간은 비워둡니다.</p><TextAreaField label="검토 메모" value={note} maxLength={2000} onChange={event => setNote(event.target.value)} disabled={locked} /><Button variant="outline" disabled={locked || !valid} onClick={() => onReview({ candidateId: candidate.id, expectedRevision: candidate.revision, outcome, baselineMinutes: minutes(baseline), reviewMinutes: minutes(review), actualMinutes: minutes(actual), note })}>검토 결과 저장</Button></div>}
  </article>;
}
