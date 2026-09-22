import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {generateGeminiText} from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-grounding/apps/engine/lib/gemini.ts';
const prior=JSON.parse(readFileSync('/tmp/moonlight-office-enum-error.json','utf8'));
const base=prior.request,original=base.responseJsonSchema.properties.sourceQuotes.items.enum;
const variants=[['ascii-ids',original.map((_,i)=>`s${i+1}`)],['short-korean',['원문']],['one-long-korean',[original.find(x=>x.length>200)]]];
const results=[];const originalFetch=globalThis.fetch;let upstream;
globalThis.fetch=async(url,init)=>{const r=await originalFetch(url,init);const d=await r.clone().json();upstream={status:r.status,modelVersion:d.modelVersion,error:d.error,finishReason:d.candidates?.[0]?.finishReason};return r;};
for(const [id,options] of variants){
 const input=structuredClone(base);input.responseJsonSchema.properties.sourceQuotes.items.enum=options;
 const start=Date.now();upstream=undefined;const response=await generateGeminiText({...input,signal:AbortSignal.timeout(45000)});
 const row={id,input,response,upstream,elapsedMs:Date.now()-start};results.push(row);
 writeFileSync('/tmp/moonlight-office-enum-shape-probe.json',JSON.stringify({kind:'schema-compatibility-development-probe',retries:0,results},null,2));
 process.stdout.write(JSON.stringify({id,ok:response.ok,status:response.status,error:upstream?.error,elapsedMs:row.elapsedMs})+'\n');
}
globalThis.fetch=originalFetch;
