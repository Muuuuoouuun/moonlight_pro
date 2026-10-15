import { createHash } from 'node:crypto';
import { isCanonicalUuid } from './uuid.js';
import { NEWS_SEARCH_TOPICS } from './research-news-topics.js';
import { estimateCallCostUsd } from './ai-pricing.js';

export const RESEARCH_BRANDS = Object.freeze([
  { slug:'politic_officer', dbSlug:'politicofficer', label:'politic_officer', dailyLimit:8, limit:1, topic:'korea', schedule:'KST 08~22시 2시간 간격' },
  { slug:'class.moon', dbSlug:'classmoon', label:'class.moon', dailyLimit:3, limit:3, topic:'education-office', schedule:'매일 KST 08시, 최대 3개' },
  { slug:'22nomad', dbSlug:'22nomad', label:'22th nomad', dailyLimit:1, limit:1, topic:'ai-labs', schedule:'매일 KST 08시, 최대 1개' },
]);
export function normalizeResearchRun(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !isCanonicalUuid(input.requestId) || Object.keys(input).some(key=>!['requestId','brand','topic','limit'].includes(key))) return null;
  const brand=RESEARCH_BRANDS.find(value=>value.slug===input.brand);
  if (!brand) return null;
  const topic=input.topic ?? brand.topic, limit=input.limit ?? brand.limit;
  if (!NEWS_SEARCH_TOPICS[brand.dbSlug]?.some(value=>value.id===topic) || !Number.isSafeInteger(limit) || limit<1 || limit>brand.limit) return null;
  return { requestId:input.requestId, brand:brand.slug, dbSlug:brand.dbSlug, topic, limit };
}
export function researchSettings(env=process.env) {
  return { enabled:env.COM_MOON_RESEARCH_ENABLED==='true', costCapUsd:null, brands:RESEARCH_BRANDS.map(({slug,label,dailyLimit,limit,schedule})=>({slug,label,dailyLimit,maxPerRun:limit,schedule})) };
}
export function stableResearchRequestId(key) {
  const hex=createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function scheduledResearchRequests(now=new Date()) {
  const kst=new Date(now.getTime()+9*3600000), hour=kst.getUTCHours();
  if (hour<8 || hour>22 || hour%2) return [];
  const day=kst.toISOString().slice(0,10);
  return RESEARCH_BRANDS.filter(brand=>brand.slug==='politic_officer'||hour===8).map(brand=>({requestId:stableResearchRequestId(`research:${day}:${brand.slug}:${brand.slug==='politic_officer'?hour:'daily'}`),brand:brand.slug,limit:brand.limit}));
}
export function projectResearchRun(row={}) {
  const usage=row.usage,prompt=usage?.promptTokenCount,output=usage?.candidatesTokenCount,total=usage?.totalTokenCount;
  const knownCount=value=>Number.isSafeInteger(value)&&value>=0;
  const thinking=knownCount(usage?.thoughtsTokenCount)?usage.thoughtsTokenCount:knownCount(total)&&knownCount(prompt)&&knownCount(output)&&total>=prompt+output?total-prompt-output:null;
  const estimatedCostUsd=knownCount(prompt)&&knownCount(output)&&knownCount(thinking)?estimateCallCostUsd({model:row.model,promptTokens:prompt,outputTokens:output,thinkingTokens:thinking}):null;
  return {id:row.id,brand:row.brand_slug,topic:row.topic,status:row.status,startedAt:row.started_at??null,finishedAt:row.finished_at??null,
    preparedCount:row.counts?.preparedCount??0,sourceCount:row.counts?.sourceCount??0,searchCalls:row.counts?.searchCalls??0,
    duplicateCount:row.counts?.duplicateCount??0,failedCount:row.counts?.failedCount??0,model:row.model??null,
    usage:row.usage?{promptTokens:row.usage.promptTokenCount??null,candidatesTokens:row.usage.candidatesTokenCount??null,totalTokens:row.usage.totalTokenCount??null}:null,
    estimatedCostUsd,reason:row.reason??null,briefIds:Array.isArray(row.brief_ids)?row.brief_ids:[]};
}
