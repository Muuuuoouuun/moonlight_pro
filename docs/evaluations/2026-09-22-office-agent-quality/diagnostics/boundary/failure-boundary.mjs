import {writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {officeQualityCli} from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-grounding/scripts/office-evaluation/cli.mjs';
import {generateOfficeResponse} from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-grounding/apps/engine/lib/office/service.ts';
import {generateGeminiText} from '/Users/clmagi/Desktop/Projects/moonlight_pro-office-grounding/apps/engine/lib/gemini.ts';
const prefix='/tmp/moonlight-office-failure-boundary';
writeFileSync(prefix+'.provider.jsonl','',{flag:'wx',mode:0o600});
let sequence=0;
const generateProvider=async input=>{
 const id=++sequence;const started=Date.now();const {signal,...request}=input;
 const response=await generateGeminiText(input);
 appendFileSync(prefix+'.provider.jsonl',JSON.stringify({id,request,response,elapsedMs:Date.now()-started,promptHash:createHash('sha256').update(input.prompt).digest('hex')})+'\n');
 return response;
};
await officeQualityCli({live:true,only:['eevee-work','vaporeon-evidence','glaceon-social'],output:prefix+'.run.jsonl','dataset-status':'development',concurrency:'1'}, {generate:generateOfficeResponse,generateProvider});
