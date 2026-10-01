import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from './server-write.js';
import { isCanonicalUuid } from './uuid.js';
import { RESEARCH_BRANDS } from './research-run-contract.js';

const dayKey=date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
const shift=(key,days)=>new Date(Date.parse(`${key}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
const text=(value,max=1000)=>typeof value==='string'?value.trim().slice(0,max):'';
const markdown=value=>text(value,3000).replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
function citationLocator(value) {
  if(typeof value!=='string')return false;
  const match=value.match(/^L([1-9][0-9]{0,4})(?:-L?([1-9][0-9]{0,4}))?$/);
  if(!match)return false;
  const start=Number(match[1]),end=Number(match[2]||match[1]);
  // Reuse previously validated legacy citations; new generation still uses
  // the stricter one-line contract in Engine. Do not expand any saved quote.
  return end>=start&&end-start<6;
}
function sourceUrl(value) {
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.toString():null; }
  catch { return null; }
}
export function mondayNewsPeriod(now=new Date()) {
  const kst=new Date(now.getTime()+9*3600000);
  if(kst.getUTCDay()!==1||kst.getUTCHours()*60+kst.getUTCMinutes()<510)return null;
  const monday=dayKey(now);
  return {periodStart:shift(monday,-7),periodEnd:shift(monday,-1),weekendStart:shift(monday,-2)};
}

export function buildMondayNewsRoundup(entries,period,{truncated=false,maxPerBrand=5,bounded=false}={}) {
  if(!Array.isArray(entries))return null;
  const seen=new Set(),selected=[];
  const eligible=entries.filter(entry=>{
    const body=entry?.payload,date=Date.parse(entry?.createdAt);
    if(!isCanonicalUuid(entry?.id)||!Number.isFinite(date)||entry.state==='discarded'||!body||body.origin!=='research-ai'||!text(body.title)||!text(body.change)||!Array.isArray(body.facts)||!body.facts.length||!Array.isArray(body.factEvidence)||!body.factEvidence.some(fact=>text(fact.quote)&&citationLocator(fact.locator)))return false;
    const key=dayKey(new Date(date));
    return key>=period.periodStart&&key<=period.periodEnd&&RESEARCH_BRANDS.some(brand=>brand.dbSlug===entry.brandSlug)&&Array.isArray(body.sources)&&body.sources.some(source=>sourceUrl(source.url)&&/^[a-f0-9]{64}$/.test(source.documentHash||''));
  }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
  for(const brand of RESEARCH_BRANDS) {
    const rows=eligible.filter(entry=>entry.brandSlug===brand.dbSlug);
    const choose=(pool,limit)=>{
      if(limit<=0)return;
      let picked=0;
      for(const entry of pool) {
        const source=entry.payload.sources.find(ref=>sourceUrl(ref.url)&&/^[a-f0-9]{64}$/.test(ref.documentHash||''));
        const key=sourceUrl(source.url);
        if(seen.has(key))continue;
        seen.add(key);selected.push({...entry,label:brand.label,source,weekend:dayKey(new Date(entry.createdAt))>=period.weekendStart});
        if(++picked>=limit)break;
      }
    };
    const weekend=rows.filter(entry=>dayKey(new Date(entry.createdAt))>=period.weekendStart);
    const weekdays=rows.filter(entry=>dayKey(new Date(entry.createdAt))<period.weekendStart);
    choose(weekend,Math.min(2,maxPerBrand));choose(weekdays,maxPerBrand-selected.filter(entry=>entry.brandSlug===brand.dbSlug).length);
  }
  if(!selected.length)return null;
  // SourceMarkdown deliberately opens only public http(s) links. Use the
  // deployed Hub URL so references remain clickable in stored Markdown.
  const link=entry=>`[리서치 원본](https://moonlight-pro-hub.vercel.app/dashboard/content/research?brief=${entry.id})`;
  const story=entry=>{
    const body=entry.payload;
    const evidence=body.factEvidence.filter(fact=>text(fact.quote)&&citationLocator(fact.locator)).slice(0,1);
    return [`### ${entry.label} · ${markdown(body.title)}`,
      markdown(body.change),
      ...evidence.map(fact=>`- ${markdown(fact.text)} — 원문 ${fact.locator}: “${markdown(fact.quote)}”`),
      text(body.whyBrand)?`브랜드 관점: ${markdown(body.whyBrand)}`:'',
      text(body.conditions)?`적용 조건: ${markdown(body.conditions)}`:'',
      text(body.counterevidence)?`반대 근거·한계: ${markdown(body.counterevidence)}`:'',
      `수집일 ${dayKey(new Date(entry.createdAt))} · ${link(entry)}`].filter(Boolean).join('\n\n');
  };
  const weekend=selected.filter(entry=>entry.weekend),weekdays=selected.filter(entry=>!entry.weekend);
  const missing=RESEARCH_BRANDS.filter(brand=>!selected.some(entry=>entry.brandSlug===brand.dbSlug)).map(brand=>brand.label);
  const uncertainties=[
    '저장된 리서치 중 브랜드별 최대 5건을 주말 우선·최근 수집 순으로 선정했다. 전체 뉴스의 중요도 순위나 모든 주요 소식의 수집을 보장하지 않는다.',
    '주말은 한국 시간의 수집일 기준이며 원문 발표일과 다를 수 있다. AI 초안은 운영자 검토 전이며, 새로운 주간 추세·인과 판단은 추가하지 않았다.',
    ...(missing.length?[`이번 회차에 근거를 확보한 브리프가 없는 브랜드: ${missing.join(' · ')}.`]:[]),
    ...(truncated?['수집된 브리프가 조회 한도를 넘어 일부 자료를 포함하지 못했다.']:[]),
    ...(bounded?['본문 저장 한도를 지키기 위해 선정 건수를 줄였다. 인용과 적용 조건은 문장 중간에서 자르지 않았다.']:[]),
  ];
  const notes=RESEARCH_BRANDS.map(brand=>{
    const rows=selected.filter(entry=>entry.brandSlug===brand.dbSlug);
    const note=rows.find(entry=>text(entry.payload.unknown));
    return note?`- **${brand.label}**: ${note.payload.unknown.length<=1000?markdown(note.payload.unknown):'후속 확인 질문은 리서치 원본의 ‘아직 확인할 것’에서 확인한다.'} ${link(note)}`:null;
  }).filter(Boolean);
  const interpretation=[
    `## 이번 주 판단에 앞서 볼 소식\n\n${selected.map(entry=>`- **${entry.label}**: ${markdown(entry.payload.title)} ${link(entry)}`).join('\n')}`,
    `## 주말에 수집한 소식\n\n${weekend.length?weekend.map(story).join('\n\n'):'토·일에 수집한 출처 기반 브리프가 없어 주말 소식을 확인하지 못했다.'}`,
    `## 지난 한 주 평일 주요 소식\n\n${weekdays.length?weekdays.map(story).join('\n\n'):'평일에 수집한 출처 기반 브리프가 없어 평일 소식을 확인하지 못했다.'}`,
    `## 이번 주 확인할 점\n\n${notes.length?notes.join('\n'):'선정 자료에 후속 확인 질문이 없어 별도 판단을 추가하지 않았다.'}`,
    `## 자료 범위와 한계\n\n${uncertainties.map(note=>`- ${note}`).join('\n')}`,
  ].join('\n\n');
  if(interpretation.length>39000&&maxPerBrand>1)return buildMondayNewsRoundup(entries,period,{truncated,maxPerBrand:maxPerBrand-1,bounded:true});
  return {origin:'monday-news-roundup',title:`월요일 주요 소식 · ${period.periodStart} — ${period.periodEnd}`,periodStart:period.periodStart,periodEnd:period.periodEnd,
    status:missing.length||truncated||bounded?'partial':'live',summary:`지난 월~일 수집 소식 ${selected.length}건 · 주말 ${weekend.length}건 · 운영자 검토 전`,
    facts:{facts:selected.map(entry=>`${entry.label}: ${text(entry.payload.change)}`),verificationLevel:'unreviewed',weekendCount:weekend.length},
    interpretation,artifactKind:'markdown',uncertainties,briefIds:selected.map(entry=>entry.id),
    sourceRefs:selected.map(entry=>({url:sourceUrl(entry.source.url),label:text(entry.source.title,240)||text(entry.payload.title,240)}))};
}

export async function prepareMondayNewsRoundup({now=new Date(),workspaceId=resolveDefaultWorkspaceId(),enabled=process.env.COM_MOON_RESEARCH_ENABLED==='true',rpc=invokeSupabaseRpc}={}) {
  const period=mondayNewsPeriod(now);
  if(!enabled||!period)return {status:'idle'};
  if(!isCanonicalUuid(workspaceId))return {status:'error',reason:'missing-workspace'};
  const args={p_workspace_id:workspaceId,p_period_start:period.periodStart};
  try {
    const receipt=await rpc('report_news_roundup_receipt_v1',args);
    if(!receipt.ok)return {status:'error',reason:'roundup-receipt-unavailable'};
    if(receipt.data?.status==='duplicate')return {...receipt.data,additionalModelCalls:0};
    if(receipt.data?.status!=='not-found')return {status:'error',reason:'roundup-receipt-unavailable'};
    const read=await rpc('report_news_roundup_sources_v1',args);
    if(!read.ok||read.data?.status!=='live'||!Array.isArray(read.data.entries))return {status:'error',reason:'roundup-sources-unavailable'};
    const payload=buildMondayNewsRoundup(read.data.entries.slice(0,100),period,{truncated:read.data.entries.length>100});
    if(!payload)return {status:'empty',reason:'no-source-backed-weekly-news',additionalModelCalls:0};
    const saved=await rpc('report_news_roundup_save_v1',{...args,p_payload:payload},{timeoutMs:15000});
    if(!saved.ok||!['saved','duplicate'].includes(saved.data?.status))return {status:'error',reason:'roundup-save-unconfirmed'};
    return {...saved.data,additionalModelCalls:0,selectedCount:payload.briefIds.length,weekendCount:payload.facts.weekendCount};
  } catch { return {status:'error',reason:'roundup-unavailable'}; }
}
