'use client';
import React from 'react';
import {OFFICE_ROSTER} from '@com-moon/agent-contracts/office';
import {Button,CheckboxRow,EmptyState,SegmentedControl,TextAreaField,TruthBadge,CertaintyBadge} from '../hub-primitives';
import {requestOffice,officeHistory} from '../office-client';
import styles from './office-council.module.css';
const MODES=[{key:'chat',label:'대화'},{key:'draft',label:'초안'},{key:'review',label:'검토'},{key:'council',label:'회의'}];
const SCOPE_LABEL={all:'전체',classin:'ClassIn',personal:'개인'};
const blank=()=>({draft:'',turns:[],error:null});
export function OfficeCouncil({scope='all'}) {
 const [ownerId,setOwnerId]=React.useState('eevee');
 const [mode,setMode]=React.useState('chat');
 const [reviewers,setReviewers]=React.useState(['umbreon']);
 const [includeProjects,setIncludeProjects]=React.useState(false);
 const [sessions,setSessions]=React.useState({});
 const [busy,setBusy]=React.useState(false);
 const inFlight=React.useRef(false);
 const controller=React.useRef(null);
 const inputRef=React.useRef(null);
 React.useEffect(()=>()=>controller.current?.abort(),[]);
 const owner=OFFICE_ROSTER.find(p=>p.id===ownerId);
 const key=`${scope}:${ownerId}:${mode}`;
 const session=sessions[key]||blank();
 const update=(patch,sessionKey=key)=>setSessions(current=>({...current,[sessionKey]:{...(current[sessionKey]||blank()),...patch}}));
 const participants=mode==='council'?[ownerId,...reviewers.filter(id=>id!==ownerId)]:[];
 function selectOwner(id) {if(busy)return;setOwnerId(id);setReviewers([id==='umbreon'?'eevee':'umbreon']);}
 async function submit(event) {
  event.preventDefault();if(inFlight.current||!session.draft.trim())return;
  const message=session.draft.trim();const originalTurns=session.turns;
  inFlight.current=true;setBusy(true);update({error:null});controller.current=new AbortController();
  const result=await requestOffice({ownerId,mode,scope,message,participants,lens:null,history:officeHistory(originalTurns),includeProjects},{signal:controller.current.signal});
  if(result.status==='generated')update({draft:'',error:null,turns:[...originalTurns,{message,result}]},key);
  else update({error:result},key);
  inFlight.current=false;setBusy(false);
 }
 return <section className={`${styles.page} fade-up`}>
  <header className={styles.header}>
   <div><div className={styles.eyebrow}>AGENTS / OFFICE</div><h2>Office Council</h2><p>필요한 담당과 이야기를 나누고, 다음 행동을 정하세요.</p></div>
   <span className={styles.scope}>{SCOPE_LABEL[scope]} 업무</span>
  </header>
  <div className={styles.layout}>
   <aside className={styles.roster} aria-label="Office 담당자">
    {OFFICE_ROSTER.map(p=><button type="button" key={p.id} className={`hub-row ${styles.member}`} aria-pressed={p.id===ownerId} disabled={busy} onClick={()=>selectOwner(p.id)}>
     <span className={styles.monogram} aria-hidden="true">{p.name.slice(0,1)}</span><span><strong>{p.name}</strong><small>{p.role}</small></span>
    </button>)}
    <p className={styles.rosterNote}>Guru는 영업 코칭,<br/>기존 Council은 브랜드 자문입니다.</p>
   </aside>
   <div className={styles.main}>
    <div className={styles.intro}><div className={styles.eyebrow}>{owner.role}</div><h3>{owner.name}<span>{owner.character}</span></h3><p>“{owner.quote}”</p></div>
    <fieldset disabled={busy} className={styles.controls}>
     <SegmentedControl label="Office 응답 방식" options={MODES} value={mode} onChange={setMode}/>
     {mode==='council'?<div className={styles.meeting}>
      <p>주관은 {owner.name}. 함께 비교할 관점을 1~2명 선택하세요.</p>
      <div className={styles.views}>{OFFICE_ROSTER.filter(p=>p.id!==ownerId).map(p=><CheckboxRow key={p.id} text={`${p.name} · ${p.role}`} checked={reviewers.includes(p.id)} disabled={!reviewers.includes(p.id)&&reviewers.length>=2} onChange={()=>setReviewers(prev=>prev.includes(p.id)?prev.filter(id=>id!==p.id):[...prev,p.id])}/>)}</div>
      <p className={styles.note}>단일 AI의 관점 시뮬레이션입니다. 실제 독립 에이전트 회의는 아닙니다.</p>
     </div>:null}
    </fieldset>
    <div className={styles.thread} aria-label={`${owner.name} 대화`}>
     {session.turns.length===0?<EmptyState icon="chat" title={`${owner.name}에게 맡길 일을 알려주세요`} description="답변과 초안을 생성합니다. 업무 저장·발송·코드 실행은 별도로 연결할 예정입니다." action={<Button variant="outline" onClick={()=>inputRef.current?.focus()}>요청 작성하기</Button>}/>:session.turns.map((turn,index)=><article key={index} className={styles.turn}>
      <p className={styles.userMessage}>{turn.message}</p>
      <div className={styles.answerHeader}><strong>{owner.name}</strong><CertaintyBadge state="recommended"/><span>{turn.result.simulation?'관점 시뮬레이션':MODES.find(m=>m.key===mode)?.label}</span></div>
      <div className={styles.answer}>{turn.result.answer}</div>
      {turn.result.recommendation?<div className={styles.decision}><strong>추천</strong><p>{turn.result.recommendation}</p><strong>근거</strong><ul>{turn.result.evidence.length?turn.result.evidence.map((v,i)=><li key={i}>{v}</li>):<li>제공된 근거 없음</li>}</ul><strong>남은 이견</strong><ul>{turn.result.dissent.length?turn.result.dissent.map((v,i)=><li key={i}>{v}</li>):<li>기록된 이견 없음</li>}</ul></div>:null}
      <div className={styles.next}><strong>다음 행동</strong><p>{turn.result.nextAction}</p></div>
      <div className={styles.receipt}><span>{turn.result.log?.persisted?'실행 로그 저장됨':'답변 생성됨 · 실행 로그 미저장'}</span><span>업무 변경 없음</span></div>
      {turn.result.context?.source&&turn.result.context.source!=='provided'?<TruthBadge state={turn.result.context.source}/>:null}
      <p className={styles.note}>{turn.result.context?.note}</p>
     </article>)}
    </div>
    <form onSubmit={submit} className={styles.composer} aria-busy={busy}>
     <TextAreaField ref={inputRef} label={`${owner.name}에게 요청`} value={session.draft} onChange={e=>update({draft:e.target.value})} maxLength={6000} rows={4} disabled={busy} placeholder="목적과 필요한 결과물을 적어주세요. 원문이나 메모를 함께 넣어도 좋아요."/>
     <CheckboxRow text="현재 범위의 최근 프로젝트 참고" checked={includeProjects} disabled={busy} onChange={()=>setIncludeProjects(v=>!v)}/>
     <p className={styles.note}>{scope==='all'?'최근 프로젝트 최대 8개를 참고합니다.':'범위가 명시된 최근 프로젝트 최대 8개를 참고합니다.'} Legend 관점은 아직 연결되지 않았습니다.</p>
     {session.error?<div role="alert" className={`${styles.notice} ${session.error.status==='error'?styles.error:''}`}><TruthBadge state={session.error.status==='preview'?'preview':'error'}/><p>{session.error.error}</p></div>:null}
     <div className={styles.actions}><span role="status">{busy?'응답을 준비하고 있습니다.':'대화는 이 화면에서만 유지됩니다.'}</span><Button type="submit" variant="primary" disabled={busy||!session.draft.trim()||(mode==='council'&&participants.length<2)}>{busy?'작성 중…':mode==='council'?'관점 비교하기':'요청 보내기'}</Button></div>
    </form>
   </div>
  </div>
 </section>;
}
