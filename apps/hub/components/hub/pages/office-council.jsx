'use client';
import React from 'react';
import {OFFICE_ROSTER} from '@com-moon/agent-contracts/office';
import {Button,CheckboxRow,EmptyState,SegmentedControl,TextAreaField,TruthBadge,CertaintyBadge} from '../hub-primitives';
import {requestOffice,officeHistory} from '../office-client';
import styles from './office-council.module.css';

const MODES=[{key:'chat',label:'대화'},{key:'draft',label:'초안'},{key:'review',label:'검토'},{key:'council',label:'회의'}];
const SCOPE_LABEL={all:'전체',classin:'ClassIn',personal:'개인'};

const TARGETED_CHAMBERS = [
  { id: 'deal-closing', label: '딜 클로징 챔버', ownerId: 'flareon', reviewerId: 'umbreon', desc: '부스터 (매출) + 블래키 (리스크)', placeholder: '고객명, 최근 고객 발언, 현재 제안안을 적어주세요. 블래키가 미확인 약속을 걸러냅니다.' },
  { id: 'build-deploy', label: '빌드·배포 챔버', ownerId: 'glaceon', reviewerId: 'jolteon', desc: '글레이시아 (제품) + 쥬피썬더 (기술)', placeholder: '만들고 싶은 기능과 해결할 문제를 적어주세요. 글레이시아가 DoD를 잡고 쥬피썬더가 최소 코드를 설계합니다.' },
  { id: 'resource-alloc', label: '자원 배분 챔버', ownerId: 'espeon', reviewerId: 'leafeon', desc: '에브이 (전략) + 리피아 (재무)', placeholder: '신규 프로젝트나 유료 툴 도입 고민을 적어주세요. 에브이가 기회비용을 분석하고 리피아가 순시간을 계산합니다.' },
  { id: 'weekly-reconcile', label: '주간 정산 챔버', ownerId: 'vaporeon', reviewerId: 'eevee', desc: '샤미드 (운영) + 이브이 (비서실장)', placeholder: '이번 주 진행한 활동과 다음 주 일정을 적어주세요. 샤미드가 일정을 정산하고 이브이가 대표 결정 1건을 브리핑합니다.' },
];

const blank=()=>({draft:'',turns:[],error:null});

export function OfficeCouncil({scope='all'}) {
  const [ownerId,setOwnerId]=React.useState('eevee');
  const [mode,setMode]=React.useState('chat');
  const [reviewers,setReviewers]=React.useState(['umbreon']);
  const [includeProjects,setIncludeProjects]=React.useState(false);
  const [shieldMode,setShieldMode]=React.useState(false);
  const [copiedId,setCopiedId]=React.useState(null);
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

  function selectChamber(chamber) {
    if(busy)return;
    setOwnerId(chamber.ownerId);
    setMode('council');
    setReviewers([chamber.reviewerId]);
    if(!session.draft.trim()){
      update({draft:chamber.placeholder});
    }
    inputRef.current?.focus();
  }

  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  }

  function renderNextAction(actionText, index) {
    const match = actionText.match(/^\[([^\]]+)\]\s*(.*)$/);
    return (
      <div className={styles.next}>
        <div className={styles.nextHeader}>
          <strong>다음 행동</strong>
          <button type="button" className={styles.copyBtn} onClick={() => copyToClipboard(actionText, `next-${index}`)}>
            {copiedId === `next-${index}` ? '복사됨 ✓' : '행동 복사'}
          </button>
        </div>
        {match ? (
          <p>
            <span className={styles.actionBadge}>{match[1]}</span>
            <span>{match[2]}</span>
          </p>
        ) : (
          <p>{actionText}</p>
        )}
      </div>
    );
  }

  async function submit(event) {
    event.preventDefault();if(inFlight.current||!session.draft.trim())return;
    const rawMessage=session.draft.trim();const originalTurns=session.turns;
    const message=shieldMode
      ? `[대표 번아웃/피로 모드 (Tier 3 방패): 모든 기획을 멈추고, 오늘 반드시 지켜야 할 최소 1개 약속과 멈출 지점만 남겨줘]\n\n${rawMessage}`
      : rawMessage;
    inFlight.current=true;setBusy(true);update({error:null});controller.current=new AbortController();
    const result=await requestOffice({ownerId,mode,scope,message,participants,lens:null,history:officeHistory(originalTurns),includeProjects},{signal:controller.current.signal});
    if(result.status==='generated')update({draft:'',error:null,turns:[...originalTurns,{message:rawMessage,result}]},key);
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
          <div className={styles.chamberSection}>
            <div className={styles.chamberTitle}>4대 전용 Council 챔버</div>
            <div className={styles.chamberPresets}>
              {TARGETED_CHAMBERS.map(c => {
                const isActive = mode === 'council' && ownerId === c.ownerId && reviewers.includes(c.reviewerId);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`${styles.chamberChip} ${isActive ? styles.chamberChipActive : ''}`}
                    onClick={() => selectChamber(c)}
                    title={c.desc}
                  >
                    <span>{c.label}</span>
                    <span className={styles.chamberDesc}>{c.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
            <div className={styles.answerHeader}>
              <strong>{owner.name}</strong>
              <CertaintyBadge state="recommended"/>
              <span>{turn.result.simulation?'관점 시뮬레이션':MODES.find(m=>m.key===mode)?.label}</span>
            </div>
            <div className={styles.answer}>{turn.result.answer}</div>
            <div className={styles.answerActions}>
              <button type="button" className={styles.copyBtn} onClick={() => copyToClipboard(turn.result.answer, `ans-${index}`)}>
                {copiedId === `ans-${index}` ? '복사됨 ✓' : '답변 복사'}
              </button>
            </div>
            {turn.result.recommendation?<div className={styles.decision}><strong>추천</strong><p>{turn.result.recommendation}</p><strong>근거</strong><ul>{turn.result.evidence.length?turn.result.evidence.map((v,i)=><li key={i}>{v}</li>):<li>제공된 근거 없음</li>}</ul><strong>남은 이견</strong><ul>{turn.result.dissent.length?turn.result.dissent.map((v,i)=><li key={i}>{v}</li>):<li>기록된 이견 없음</li>}</ul></div>:null}
            {renderNextAction(turn.result.nextAction, index)}
            <div className={styles.receipt}><span>{turn.result.log?.persisted?'실행 로그 저장됨':'답변 생성됨 · 실행 로그 미저장'}</span><span>업무 변경 없음</span></div>
            {turn.result.context?.source&&turn.result.context.source!=='provided'?<TruthBadge state={turn.result.context.source}/>:null}
            <p className={styles.note}>{turn.result.context?.note}</p>
          </article>)}
        </div>
        <form onSubmit={submit} className={styles.composer} aria-busy={busy}>
          <TextAreaField ref={inputRef} label={`${owner.name}에게 요청`} value={session.draft} onChange={e=>update({draft:e.target.value})} maxLength={6000} rows={4} disabled={busy} placeholder="목적과 필요한 결과물을 적어주세요. 원문이나 메모를 함께 넣어도 좋아요."/>
          <div className={styles.actions}>
            <CheckboxRow text="현재 범위의 최근 프로젝트 참고" checked={includeProjects} disabled={busy} onChange={()=>setIncludeProjects(v=>!v)}/>
            <button
              type="button"
              className={`${styles.shieldBtn} ${shieldMode ? styles.shieldBtnActive : ''}`}
              onClick={() => setShieldMode(v => !v)}
              aria-pressed={shieldMode}
              title="대표 번아웃/피로 시 모든 기획을 멈추고 최소 1개 약속만 남기는 인지 방패"
            >
              <span aria-hidden="true">🛡️</span>
              <span>{shieldMode ? '인지 방패 켜짐 (Tier 3)' : '인지 방패 모드'}</span>
            </button>
          </div>
          <p className={styles.note}>{scope==='all'?'최근 프로젝트 최대 8개를 참고합니다.':'범위가 명시된 최근 프로젝트 최대 8개를 참고합니다.'} Legend 관점은 아직 연결되지 않았습니다.</p>
          {session.error?<div role="alert" className={`${styles.notice} ${session.error.status==='error'?styles.error:''}`}><TruthBadge state={session.error.status==='preview'?'preview':'error'}/><p>{session.error.error}</p></div>:null}
          <div className={styles.actions}><span role="status">{busy?'응답을 준비하고 있습니다.':'대화는 이 화면에서만 유지됩니다.'}</span><Button type="submit" variant="primary" disabled={busy||!session.draft.trim()||(mode==='council'&&participants.length<2)}>{busy?'작성 중…':mode==='council'?'관점 비교하기':'요청 보내기'}</Button></div>
        </form>
      </div>
    </div>
  </section>;
}
