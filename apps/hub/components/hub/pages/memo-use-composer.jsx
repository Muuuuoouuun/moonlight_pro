"use client";
import React from 'react';
import { Button, Drawer, SelectField, TextField, TruthBadge } from '../hub-primitives';
import { CONTEXT_TYPES } from '@/lib/journal-client';
import { STUDIO_CHANNELS } from '@/lib/content-workflow-client';
import { MemoContextPicker } from './memo-context-picker';

export function MemoUseComposer({ model, onReload }) {
  const { reuseDraft, locked, busy, pending } = model;
  const [chosen, setChosen] = React.useState(() => reuseDraft.targetContext ? [reuseDraft.targetContext] : model.draft.contexts.filter((context) => context.id === (reuseDraft.target.projectId || reuseDraft.target.brandId)));
  const titleRef = React.useRef(null);
  const [copyMessage, setCopyMessage] = React.useState('');
  const task = reuseDraft.action === 'create_task';
  const updateContext = (contexts) => { setChosen(contexts); model.editUseContext(contexts[0] || null); };
  return <Drawer title={task ? '메모에서 할 일 만들기' : '메모에서 콘텐츠 시작하기'} subtitle="선택한 발췌와 원문 링크를 함께 남깁니다." presentation="compact" width="min(560px, 96vw)" initialFocusRef={titleRef} onClose={model.closeUse}
    footer={<div className="memo-footer"><Button variant="outline" onClick={model.closeUse} disabled={busy}>메모로 돌아가기</Button>
      <Button variant="primary" disabled={locked || !model.workspaceConfirmed || model.source !== 'live' || !reuseDraft.target.title.trim()} onClick={model.submitUse}>{busy ? '저장 중…' : task ? '할 일 만들기' : '콘텐츠 만들기'}</Button></div>}>
    <div className="memo-composer memo-stack">
      {model.source !== 'live' && <div className="memo-feedback"><TruthBadge state={model.source} /><p>연결을 확인한 뒤 저장 결과를 확인할 수 있어요.</p><Button onClick={onReload} disabled={busy}>연결 다시 확인</Button></div>}
      {model.localError && <div className="memo-feedback" role="alert"><p>이 탭의 복구 사본을 저장하지 못했어요. 제목과 발췌를 복사해 보관해 주세요.</p><Button onClick={() => navigator.clipboard.writeText(`${reuseDraft.target.title}\n\n${reuseDraft.selection.text}`).then(() => setCopyMessage('입력을 복사했어요.')).catch(() => setCopyMessage('복사하지 못했어요. 제목과 발췌를 직접 선택해 복사해 주세요.'))}>입력 복사</Button>{copyMessage && <p role="status">{copyMessage}</p>}</div>}
      <TextField ref={titleRef} label={task ? '어떤 행동을 할까요?' : '콘텐츠 기획 제목'} placeholder={task ? '예: 첫 주 준비 흐름 한 장으로 정리하기' : '예: 도입 전에 확인할 첫 주 운영 질문'} value={reuseDraft.target.title} maxLength={200} disabled={locked} onChange={(event) => model.editUse({ title: event.target.value })} />
      <div><span className="memo-muted">전달할 발췌</span><blockquote className="memo-selection">{reuseDraft.selection.text}</blockquote></div>
      {task ? <TextField label="기한 · 선택" type="date" disabled={locked} value={reuseDraft.target.dueAt ? new Date(reuseDraft.target.dueAt).toLocaleDateString('en-CA') : ''} onChange={(event) => model.editUse({ dueAt: event.target.value ? new Date(`${event.target.value}T18:00:00`).toISOString() : null })} />
        : <SelectField label="만들 채널" options={STUDIO_CHANNELS.map((channel) => ({ value: channel.key, label: channel.label }))} value={reuseDraft.target.channel} disabled={locked} onChange={(event) => model.editUse({ channel: event.target.value })} />}
      <MemoContextPicker single selected={chosen} types={CONTEXT_TYPES.filter(({ value }) => value === (task ? 'project' : 'brand'))} onChange={updateContext} disabled={locked} />
      <p className="memo-muted">{task ? '내 작업에서 기한·진행 상태를 이어서 관리할 수 있어요.' : '스튜디오의 원문·기획 카드에 발췌를 넣어둡니다. 초안 작성과 AI 변형은 그곳에서 이어갈 수 있어요.'}</p>
      {model.message && <div className="memo-feedback" role={model.saveState === 'error' ? 'alert' : 'status'}><p>{model.message}</p>
        {pending && <Button variant="outline" onClick={model.retry} disabled={busy || !model.workspaceConfirmed || model.source === 'loading'}>이전 요청 결과 확인</Button>}
        {model.conflict && !pending && <Button variant="outline" onClick={model.closeUse}>메모로 돌아가 원문 확인</Button>}
      </div>}
    </div>
  </Drawer>;
}
