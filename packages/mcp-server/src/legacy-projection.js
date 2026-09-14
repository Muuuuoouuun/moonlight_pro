const PRESERVE=['status','source','configured','workspaceId','asOf','partial','failedSources','missingSources','retryable','error','message'];
const ROW_FIELDS=['id','title','name','label','status','priority','projectId','project_id','dueAt','due_at','updatedAt','updated_at','createdAt','created_at','nextAction','next_action','stage','value','score'];
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
function row(value){
  if(!value||typeof value!=='object')return typeof value==='string'?value.slice(0,200):value;
  const out={};for(const k of ROW_FIELDS)if(value[k]!==undefined)out[k]=typeof value[k]==='string'?value[k].slice(0,200):value[k];
  out.detailsOmitted=Object.keys(value).some(k=>!ROW_FIELDS.includes(k))||ROW_FIELDS.some(k=>typeof value[k]==='string'&&value[k].length>200);
  return out;
}
export function projectLegacyPayload(payload,options={}){
  let {detail='summary',limit=20,offset=0}=options;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return {status:'error',error:'Invalid Hub response'};
  const budget=detail==='summary'?2048:detail==='full'?32768:16384;
  if(bytes(payload)<=budget&&offset===0&&options.limit===undefined)return payload;
  limit=Math.max(1,Math.min(100,Number(limit)||20));offset=Math.max(0,Number(offset)||0);
  const out={};for(const k of PRESERVE)if(payload[k]!==undefined)out[k]=payload[k];
  out.truncated=true;out.collections={};out.data={};
  for(const [key,values] of Object.entries(payload)){
    if(!Array.isArray(values)||PRESERVE.includes(key))continue;
    const selected=detail==='summary'?[]:values.slice(offset,offset+limit).map(row);
    out.data[key]=selected;out.collections[key]={totalCount:values.length,returnedCount:selected.length,nextOffset:offset+selected.length<values.length?offset+selected.length:null};
  }
  out.hint='Legacy projection. Use detail:rows, limit and offset for pages; use Agent entity tools or Hub for omitted details.';
  if(payload.summary&&typeof payload.summary==='object'){
    out.summary=Object.fromEntries(Object.entries(payload.summary).filter(([,v])=>v===null||['number','boolean'].includes(typeof v)||typeof v==='string'&&v.length<120).slice(0,15));
  }
  // Remove complete trailing rows rather than cutting serialized JSON or inventing completeness.
  while(bytes(out)>budget){
    const key=Object.keys(out.data).find(k=>out.data[k].length>0);
    if(key){out.data[key].pop();out.collections[key].returnedCount=out.data[key].length;out.collections[key].nextOffset=offset+out.data[key].length;continue;}
    if(out.summary){delete out.summary;continue;}
    for(const k of ['message','error'])if(typeof out[k]==='string'&&out[k].length>200)out[k]=out[k].slice(0,200);
    if(bytes(out)>budget){return {status:payload.status,source:payload.source,partial:payload.partial,truncated:true,error:'Legacy metadata exceeds output limit; use a scoped Agent query.',hint:out.hint};}
  }
  return out;
}
