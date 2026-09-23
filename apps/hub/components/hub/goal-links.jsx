"use client";
import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button, SelectField, Skeleton, TruthBadge } from './hub-primitives';
import { isCanonicalUuid } from '@/lib/uuid';
import { goalHref } from '@/lib/goal-client';
import { useGoals, useGoalCommand } from './use-goals';
import { GoalCommandFeedback, goalScopeLabel } from './goal-components';

const entityTypes = new Set(['projects', 'tasks', 'campaigns', 'brands', 'content_items', 'deals', 'leads', 'customer_accounts', 'memos', 'journal_entries']);
const GoalAssistancePanel = dynamic(() => import('./goal-assistance-panel').then(module => module.GoalAssistancePanel), { ssr: false });

export function GoalLinks({ entityType, entityId, scope, showAssistance = true }) {
  if (!entityTypes.has(entityType) || !isCanonicalUuid(entityId)) return null;
  return <GoalLinksPanel key={`${entityType}:${entityId}`} entityType={entityType} entityId={entityId} scope={scope} showAssistance={showAssistance} />;
}

function GoalLinksPanel({ entityType, entityId, showAssistance }) {
  const query = new URLSearchParams({ entityType, entityId }).toString();
  const model = useGoals(query);
  const [choosing, setChoosing] = React.useState(false);
  const [selected, setSelected] = React.useState('');
  const [unlinking, setUnlinking] = React.useState(null);
  const choices = useGoals(model.entityScope ? new URLSearchParams({ scope: model.entityScope }).toString() : '', choosing && Boolean(model.entityScope));
  const command = useGoalCommand(`link:${entityType}:${entityId}`, () => { setChoosing(false); setUnlinking(null); setSelected(''); model.refresh(); });
  const linked = new Set(model.objectives.map(item => item.id));
  const available = choices.objectives.filter(item => item.status !== 'archived' && !linked.has(item.id));
  const selectedObjective = available.find(item => item.id === selected);
  const canWrite = ['live', 'partial'].includes(model.status) && Boolean(model.entityScope) && !command.locked;
  function mutate(action, objective) {
    if (!objective || !canWrite) return;
    command.submit(action, { objectiveId: objective.id, entityType, entityId }, objective.revision);
  }
  return <><section className="goal-links" aria-label="연결된 목표">
    <div className="goal-card-heading"><h3>연결된 목표</h3><Button variant="outline" disabled={!canWrite} onClick={() => setChoosing(value => !value)} aria-expanded={choosing}>목표 연결</Button></div>
    <p className="goal-muted">{entityType === 'tasks' ? '이 할 일이 기여하는 주간·월간 목표를 연결합니다. 연결하지 않아도 할 일을 저장하고 완료할 수 있습니다.' : '이 업무가 기여하는 같은 소속의 목표를 연결합니다.'} 연결만으로 목표 실적이 늘어나지는 않습니다.</p>
    {model.status === 'loading' ? <Skeleton lines={2} height={14} label="연결된 목표 불러오는 중" /> : model.status === 'error' || model.status === 'preview' ? <div className="goal-actions"><TruthBadge state={model.status} /><span>{model.status === 'preview' ? '목표 저장소 연결이 필요합니다.' : model.error || '목표 정보를 읽지 못했습니다. 잠시 후 다시 확인해 주세요.'}</span><Button disabled={model.refreshing} onClick={model.refresh}>{model.refreshing ? '확인 중…' : '다시 확인'}</Button></div> : <>
      {model.status === 'partial' && <div className="goal-actions"><TruthBadge state="partial" /><Button onClick={model.refresh}>다시 불러오기</Button></div>}
      {model.objectives.length ? model.objectives.map(objective => <div className="goal-link-row" key={objective.id}><Link className="hub-row" href={goalHref(objective.id, objective.scope)} target="_blank" rel="noopener noreferrer" title="새 탭에서 목표 보기"><span>{objective.title}</span><span className="goal-muted">{goalScopeLabel(objective.scope)} · {objective.periodStart}–{objective.periodEnd}{objective.status === 'archived' ? ' · 보관됨' : ''}</span></Link><Button disabled={!canWrite} onClick={() => setUnlinking(objective.id)} aria-label={`${objective.title} 연결 해제`}>해제</Button></div>) : <p className="goal-muted">{model.status === 'partial' ? '연결된 목표를 모두 확인하지 못했습니다. 다시 확인해 주세요.' : '연결한 목표가 없습니다. 목표를 정해 관리할 때만 연결하세요.'}</p>}
    </>}
    {unlinking && <div className="goal-feedback"><p>업무와 목표를 남겨두고 연결만 해제합니다.</p><div className="goal-actions"><Button disabled={!canWrite} onClick={() => mutate('unlink_entity', model.objectives.find(item => item.id === unlinking))}>연결 해제</Button><Button disabled={command.state === 'saving'} onClick={() => setUnlinking(null)}>취소</Button></div></div>}
    {choosing && <div className="goal-form">
      {choices.status === 'loading' ? <Skeleton lines={2} height={14} label="연결할 목표 찾는 중" /> : choices.status === 'error' || choices.status === 'preview' ? <div className="goal-actions"><p>연결할 목표를 확인하지 못했습니다.</p><Button onClick={choices.refresh}>다시 불러오기</Button></div> : <>
        {choices.status === 'partial' && <div className="goal-actions"><TruthBadge state="partial" /><span>일부 목표만 확인했습니다.</span><Button onClick={choices.refresh}>다시 확인</Button></div>}
        {available.length > 0 && <SelectField label="연결할 목표" value={selected} disabled={command.locked} options={[{ value: '', label: '목표 선택' }, ...available.map(item => ({ value: item.id, label: `${goalScopeLabel(item.scope)} · ${item.title}` }))]} onChange={event => setSelected(event.target.value)} />}
        {!available.length && <p className="goal-muted">{choices.status === 'partial' ? '목표 목록을 모두 확인한 뒤 연결하세요.' : '추가로 연결할 목표가 없습니다. 필요하면 목표·성과에서 새로 만들 수 있습니다.'}</p>}
        <div className="goal-actions">{available.length > 0 && <Button variant="primary" disabled={!selectedObjective || !canWrite} onClick={() => mutate('link_entity', selectedObjective)}>연결 저장</Button>}<Button disabled={command.state === 'saving'} onClick={() => setChoosing(false)}>닫기</Button><Link href={goalHref(null, model.entityScope, { create: true })} target="_blank" rel="noopener noreferrer" className="hub-row">목표 만들기 · 새 탭 ↗</Link></div>
      </>}
    </div>}
    <GoalCommandFeedback command={command} />
    {command.state === 'conflict' && <Button onClick={() => { command.reset(); model.refresh(); choices.refresh(); }}>최신 목표를 다시 확인</Button>}
  </section>{showAssistance && model.entityScope && ['tasks', 'projects', 'content_items'].includes(entityType) && <GoalAssistancePanel entityType={entityType} entityId={entityId} scope={model.entityScope} />}</>;
}
