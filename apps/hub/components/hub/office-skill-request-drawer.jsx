'use client';
import React from 'react';
import { Button, CertaintyBadge, Drawer, EmptyState, LifecycleBadge, Skeleton, TextAreaField, TextField, TruthBadge } from './hub-primitives';
import { copyOfficeText } from './office-session';
import {
  OFFICE_SKILL_EVIDENCE_LABELS, OFFICE_SKILL_REQUEST_WINDOW, OFFICE_SKILL_STATE_LABELS, formatOfficeSkillTime,
  loadOfficeSkillRequests, officeSkillRequestDraft, officeSkillRequestText, saveOfficeSkillRequest, validateOfficeSkillRequest,
} from './office-skill-request';
import styles from './office-skill-request-drawer.module.css';

const LIFECYCLE = { requested: 'queued', completed: 'done', failed: 'blocked' };

function SkillRequestState({ state }) {
  if (state === 'unconfirmed') return <CertaintyBadge state="unknown" label={OFFICE_SKILL_STATE_LABELS.unconfirmed} />;
  return <LifecycleBadge state={LIFECYCLE[state]} label={OFFICE_SKILL_STATE_LABELS[state]} />;
}

function SkillRequestRow({ item }) {
  const receipt = item.receipt;
  return <li className={styles.historyRow}>
    <div className={styles.historyMeta}><SkillRequestState state={item.state} />
      {item.createdAt ? <span className="mono">{formatOfficeSkillTime(item.createdAt)}</span> : null}</div>
    <p className={styles.historyInstruction}>{item.instruction}</p>
    {receipt ? <div className={styles.receipt}>
      {receipt.summary ? <p>{receipt.summary}</p> : null}
      {receipt.evidence.length ? <ul className={styles.evidence}>{receipt.evidence.map((evidence, index) => <li key={index}>
        <span className={styles.evidenceKind}>{OFFICE_SKILL_EVIDENCE_LABELS[evidence.kind]}</span> <span className="mono">{evidence.value}</span></li>)}</ul>
        : <p className={styles.hint}>기록된 증거 없음</p>}
      <p className={styles.hint}>기록 <span className="mono">{item.receiptActorId || '확인 안 됨'}</span>
        {item.receiptAt ? <> · <span className="mono">{formatOfficeSkillTime(item.receiptAt)}</span></> : null}
        {item.state === 'completed' ? (receipt.commandReceiptVerified ? ' · 할 일 완료 명령 확인됨' : ' · 할 일 완료 명령 연결 없음') : null}</p>
    </div> : <p className={styles.hint}>아직 실행 결과가 기록되지 않았습니다.</p>}
    <details className={styles.original}><summary>요청 원문과 완료 기준</summary>
      <p>{item.instruction}</p><p><strong>완료 증거</strong> {item.expectedEvidence || '제공 없음'}</p>
      <p className={styles.hint}>요청 <span className="mono">{item.requestId}</span></p></details>
  </li>;
}

// Presentational so every read state can be rendered and checked without a network.
export function OfficeSkillRequestHistory({ state, onRefresh, title = '이 할 일의 요청 기록' }) {
  const titleId = React.useId();
  const loading = state.status === 'loading';
  return <section className={styles.history} aria-labelledby={titleId} aria-busy={loading}>
    <div className={styles.historyHead}><strong id={titleId}>{title}</strong>
      <Button variant="ghost" size="xs" disabled={loading} onClick={onRefresh}>다시 확인</Button></div>
    {loading ? <Skeleton lines={2} label="요청 기록 확인 중" /> : null}
    {state.status === 'preview' ? <p className={styles.hint}><TruthBadge state="preview" /> 요청 기록은 저장 연결 후 표시됩니다.</p> : null}
    {state.status === 'error' ? <div className={styles.notice} role="alert"><TruthBadge state="error" /><span>{state.error || '요청 기록을 읽지 못했습니다.'}</span></div> : null}
    {state.status === 'live' ? state.items.length
      ? <ol className={styles.historyList}>{state.items.map(item => <SkillRequestRow key={item.requestId} item={item} />)}</ol>
      : <EmptyState icon="inbox" title="저장한 요청서가 없습니다" description="요청서를 저장하면 로컬 실행 결과를 여기서 확인합니다." style={{ minHeight: 0, padding: '16px 12px' }} />
      : null}
    {state.status === 'live' && state.windowFull ? <p className={styles.hint}>최근 요청 {OFFICE_SKILL_REQUEST_WINDOW}건 안에서만 찾았습니다.</p> : null}
  </section>;
}

// Reads once when the drawer opens and again only when the operator asks. No polling.
function useOfficeSkillRequests(taskId, meetingId) {
  const [state, setState] = React.useState({ status: 'loading', items: [] });
  const readRef = React.useRef(0);
  const controllerRef = React.useRef(null);
  const load = React.useCallback(() => {
    if (!taskId) return;
    const readId = ++readRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading', items: [] });
    loadOfficeSkillRequests(taskId, { signal: controller.signal, meetingId }).then(next => {
      if (readId === readRef.current && !controller.signal.aborted) setState(next);
    });
  }, [taskId, meetingId]);
  React.useEffect(() => {
    load();
    return () => { readRef.current += 1; controllerRef.current?.abort(); };
  }, [load]);
  return [state, load];
}

export function OfficeSkillRequestDrawer({ agenda, officeScope, result, meetingId, officeTurnId, onClose }) {
  const initial = React.useMemo(() => officeSkillRequestDraft({ agenda, officeScope, result, meetingId, officeTurnId }), [agenda, officeScope, result, meetingId, officeTurnId]);
  const [requestId, setRequestId] = React.useState(() => crypto.randomUUID());
  const [instruction, setInstruction] = React.useState(initial?.instruction || '');
  const [expectedEvidence, setExpectedEvidence] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const [failure, setFailure] = React.useState(null);
  const [copied, setCopied] = React.useState(null);
  const [history, reloadHistory] = useOfficeSkillRequests(initial?.taskId || null, initial?.meetingId);
  const input = initial && { requestId, taskId: initial.taskId, scope: initial.scope, instruction, expectedEvidence,
    ...(initial.meetingId !== undefined || initial.officeTurnId !== undefined ? { meetingId: initial.meetingId, officeTurnId: initial.officeTurnId } : {}) };
  const invalid = input ? validateOfficeSkillRequest(input) : null;
  function edit(setter, value) {
    setter(value);
    if (failure) { setFailure(null); setRequestId(crypto.randomUUID()); }
  }
  async function submit(event) {
    event.preventDefault();
    if (!input || invalid || busy || saved) return;
    setBusy(true); setFailure(null);
    const result = await saveOfficeSkillRequest(input);
    setBusy(false);
    if (result.status === 'ready') { setSaved(result.request); reloadHistory(); }
    else setFailure(result);
  }
  async function copy() {
    const ok = await copyOfficeText(officeSkillRequestText(saved), navigator.clipboard);
    setCopied(ok);
  }
  return <Drawer title="로컬 스킬 요청서" subtitle="실행은 Mac의 Claude Code·Codex에서 직접 확인한 뒤 진행합니다." onClose={onClose} width="min(520px, 94vw)">
    {!initial ? <div className={styles.body}><EmptyState icon="check" title="연결된 할 일이 필요합니다" description="현재 범위가 분명한 할 일을 안건으로 가져와야 요청서를 저장할 수 있습니다." /></div>
      : <><form className={styles.body} onSubmit={submit}>
        <p className={styles.context}>연결된 할 일 <span className="mono">{initial.taskId}</span> · {initial.scope === 'classin' ? '회사' : '개인'}</p>
        {initial.unscopedTask ? <p className={styles.context}>프로젝트가 없는 할 일은 개인 범위로만 저장됩니다. 회사 일이면 회사 프로젝트에 연결한 뒤 요청해 주세요.</p> : null}
        <TextAreaField label="수행 범위" value={instruction} onChange={event => edit(setInstruction, event.target.value)} maxLength={4000} rows={5} disabled={busy || Boolean(saved)}
          hint="실제 실행기에서 할 일과 파일 범위를 다시 확인합니다." />
        <TextField label="완료를 확인할 증거" value={expectedEvidence} onChange={event => edit(setExpectedEvidence, event.target.value)} maxLength={500} disabled={busy || Boolean(saved)}
          placeholder="예: 정리된 파일 경로와 누락 목록" />
        {invalid && (instruction || expectedEvidence) && !saved ? <p className={styles.hint}>{invalid}</p> : null}
        {failure ? <div className={styles.notice} role={failure.status === 'error' ? 'alert' : 'status'}><TruthBadge state={failure.status === 'preview' ? 'preview' : 'error'} /><span>{failure.error}</span></div> : null}
        {saved ? <div className={styles.saved} role="status"><TruthBadge state="live" /><strong>요청서 저장됨 · 실행 전</strong>
          <span className="mono">{saved.requestId}</span><p>복사해 로컬 스킬 실행기에 전달하세요. 복사나 저장만으로 할 일이 완료되지 않습니다.</p>
          <Button variant="outline" type="button" onClick={copy}>요청서 복사</Button>
          {copied !== null ? <span role={copied ? 'status' : 'alert'}>{copied ? '복사했습니다.' : '복사하지 못했습니다. 내용을 선택해 복사해 주세요.'}</span> : null}
        </div> : <div className={styles.actions}><Button variant="primary" type="submit" disabled={busy || Boolean(invalid)}>{busy ? '저장 중…' : '요청서 저장'}</Button></div>}
      </form>
      <OfficeSkillRequestHistory state={history} onRefresh={reloadHistory} title={meetingId ? '이 회의의 요청 기록' : undefined} /></>}
  </Drawer>;
}
