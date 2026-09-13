"use client";
import React from 'react';
import {Button,TextField,TruthBadge} from './hub-primitives';
import {DISCOVERY_NUDGE_RULES,validNudgeContext,nextNudgeDate,prepareNudgeCommand} from '@/lib/discovery-nudge';
const CHANGE_EVENT='moonlight:discovery-nudge';
const CHANGE_KEY='moonlight.discovery-nudge-change';
function announceChange(source) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:{source}}));
  try { localStorage.setItem(CHANGE_KEY,crypto.randomUUID()); } catch { /* Focus refresh works without storage. */ }
}

// One persisted context is shared by every place this opportunity is shown.
export function DiscoveryNudge({record,compact=false,onAction,onOpen,onReload,onBusyChange}) {
  const source=React.useId();
  const queuedRefresh=React.useRef(false);
  const [state,setState]=React.useState({status:'loading',context:null});
  const [version,refresh]=React.useReducer(v=>v+1,0);
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const [chooseDate,setChooseDate]=React.useState(false);
  const [until,setUntil]=React.useState('');
  const pending=React.useRef(null),writing=React.useRef(false),reader=React.useRef(null);
  React.useEffect(()=>{
    const changed=e=>{if(e?.detail?.source===source)return;if(writing.current)queuedRefresh.current=true;else refresh();};
    const storage=e=>{if(e.key===CHANGE_KEY)changed();};
    window.addEventListener(CHANGE_EVENT,changed);window.addEventListener('storage',storage);window.addEventListener('focus',changed);
    return()=>{window.removeEventListener(CHANGE_EVENT,changed);window.removeEventListener('storage',storage);window.removeEventListener('focus',changed);};
  },[source]);
  React.useEffect(()=>{
    if(writing.current)return;
    const controller=new AbortController();reader.current=controller;
    setState({status:'loading',context:null});setMessage('');
    fetch(`/api/hub/discovery/nudge?id=${encodeURIComponent(record.id)}`,{signal:controller.signal,cache:'no-store'})
      .then(async r=>{const d=await r.json();if(controller.signal.aborted)return;setState(r.ok && d.status==='live' && validNudgeContext(d.context,record.id)?d:{status:d.status==='preview'?'preview':'error',context:null});})
      .catch(()=>{if(!controller.signal.aborted)setState({status:'error',context:null});});
    return()=>controller.abort();
  },[record.id,record.revision,version]);
  const context=state.context;
  const change=async action=>{
    if(writing.current || !context)return;
    writing.current=true;reader.current?.abort();setBusy(true);onBusyChange?.(true);setMessage('');
    pending.current=prepareNudgeCommand(context,action,until,pending.current);
    try {
      const r=await fetch('/api/hub/discovery/nudge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current.payload)});
      const d=await r.json();
      if(['saved','duplicate'].includes(d.status) && r.ok && validNudgeContext(d.context,record.id)){
        setState({status:'live',context:d.context});setChooseDate(false);setMessage(action==='resume'?'표시 설정을 되돌렸어요.':'');pending.current=null;announceChange(source);
      } else if(d.status==='conflict' && validNudgeContext(d.context,record.id)) {
        setState({status:'live',context:d.context});pending.current=null;setMessage('다른 변경이 먼저 저장됐어요. 최신 제안을 확인하고 다시 선택해 주세요.');
      } else setMessage(d.message || '설정을 저장하지 못했어요. 같은 선택으로 다시 시도해 주세요.');
    }catch{setMessage('설정을 저장하지 못했어요. 같은 선택으로 다시 시도해 주세요.');}
    finally{writing.current=false;setBusy(false);onBusyChange?.(false);if(queuedRefresh.current){queuedRefresh.current=false;refresh();}}
  };
  const reloadRecord=async()=>{
    if(writing.current)return;
    writing.current=true;reader.current?.abort();setBusy(true);onBusyChange?.(true);setMessage('');
    try { if(!await onReload?.())setMessage('최신 기록을 불러오지 못했어요. 다시 시도해 주세요.'); }
    catch { setMessage('최신 기록을 불러오지 못했어요. 다시 시도해 주세요.'); }
    finally { writing.current=false;setBusy(false);onBusyChange?.(false);if(queuedRefresh.current){queuedRefresh.current=false;refresh();} }
  };
  if(state.status==='loading')return compact?null:<p className="discovery-hint" role="status">다음 행동을 확인하고 있어요…</p>;
  if(state.status!=='live')return <div className="discovery-nudge-feedback" role="status"><TruthBadge state={state.status} /><span>다음 행동 표시 설정을 확인하지 못했어요.</span><Button variant="ghost" onClick={refresh}>다시 확인</Button></div>;
  if(!compact && context.recordRevision!==record.revision)return <div className="discovery-nudge-feedback" role="status"><span>다른 곳에서 기록이 바뀌었어요.</span><Button variant="outline" disabled={busy} onClick={reloadRecord}>최신 기록 불러오기</Button>{message && <p>{message}</p>}</div>;
  if(!context.visible) {
    if(compact || !context.suppression)return null;
    return <div className="discovery-nudge-muted"><p role="status">{context.suppression.kind==='snoozed'?`${context.suppression.until}까지 제안을 미뤘어요.`:'같은 계기의 제안을 숨긴 상태예요.'}</p><Button variant="ghost" disabled={busy} onClick={()=>change('resume')}>제안 다시 보기</Button>{message && <p role="status">{message}</p>}</div>;
  }
  if(compact && context.candidate.ruleId!=='review')return null;
  const rule=DISCOVERY_NUDGE_RULES[context.candidate.ruleId];
  return <section className={`discovery-nudge${compact?' discovery-nudge-compact':''}`} aria-label={compact?`${record.title} 다음 행동`:'지금 이어갈 행동'}>
    <div className="discovery-nudge-copy"><span className="discovery-eyebrow">{compact?'다시 볼 기회':'지금 이어갈 행동'}</span><h3>{compact?record.title:rule.title}</h3><p>{compact?`${record.reviewDate} · ${rule.reason}`:rule.reason}</p></div>
    <div className="discovery-nudge-actions"><Button variant={compact?'outline':'primary'} disabled={busy} onClick={()=>compact?onOpen?.():onAction?.(rule.field)}>{rule.label}</Button><Button variant="ghost" disabled={busy} aria-expanded={chooseDate} onClick={()=>{setUntil(nextNudgeDate(context.today));setChooseDate(v=>!v);}}>나중에</Button><Button variant="ghost" disabled={busy} onClick={()=>change('dismiss')}>이 제안 숨기기</Button></div>
    {chooseDate && <div className="discovery-nudge-date"><TextField label="다시 제안할 날짜" type="date" value={until} min={nextNudgeDate(context.today)} max={nextNudgeDate(context.today,365)} disabled={busy} onChange={e=>setUntil(e.target.value)} /><Button variant="outline" disabled={busy || !until || until<=context.today || until>nextNudgeDate(context.today,365)} onClick={()=>change('snooze')}>이 날짜까지 미루기</Button><Button variant="ghost" disabled={busy} onClick={()=>setChooseDate(false)}>취소</Button></div>}
    {message && <p className="discovery-nudge-feedback" role="status">{message}</p>}
  </section>;
}
