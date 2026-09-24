'use client';
import React from 'react';
import { Button, Drawer, EmptyState, TextAreaField, TextField, TruthBadge } from './hub-primitives';
import { copyOfficeText } from './office-session';
import { officeSkillRequestDraft, officeSkillRequestText, saveOfficeSkillRequest, validateOfficeSkillRequest } from './office-skill-request';
import styles from './office-skill-request-drawer.module.css';

export function OfficeSkillRequestDrawer({ agenda, officeScope, result, onClose }) {
  const initial = React.useMemo(() => officeSkillRequestDraft({ agenda, officeScope, result }), [agenda, officeScope, result]);
  const [requestId, setRequestId] = React.useState(() => crypto.randomUUID());
  const [instruction, setInstruction] = React.useState(initial?.instruction || '');
  const [expectedEvidence, setExpectedEvidence] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const [failure, setFailure] = React.useState(null);
  const [copied, setCopied] = React.useState(null);
  const input = initial && { requestId, taskId: initial.taskId, scope: initial.scope, instruction, expectedEvidence };
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
    if (result.status === 'ready') setSaved(result.request);
    else setFailure(result);
  }
  async function copy() {
    const ok = await copyOfficeText(officeSkillRequestText(saved), navigator.clipboard);
    setCopied(ok);
  }
  return <Drawer title="로컬 스킬 요청서" subtitle="실행은 Mac의 Claude Code·Codex에서 직접 확인한 뒤 진행합니다." onClose={onClose} width="min(520px, 94vw)">
    {!initial ? <div className={styles.body}><EmptyState icon="check" title="연결된 할 일이 필요합니다" description="현재 범위가 분명한 할 일을 안건으로 가져와야 요청서를 저장할 수 있습니다." /></div>
      : <form className={styles.body} onSubmit={submit}>
        <p className={styles.context}>연결된 할 일 <span className="mono">{initial.taskId}</span> · {initial.scope === 'classin' ? '회사' : '개인'}</p>
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
      </form>}
  </Drawer>;
}
