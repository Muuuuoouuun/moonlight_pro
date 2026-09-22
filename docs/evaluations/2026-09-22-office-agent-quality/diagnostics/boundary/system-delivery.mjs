import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateGeminiText,getGeminiIntegrationStatus} from '/Users/clmagi/Desktop/Projects/moonlight_proj/apps/engine/lib/gemini.ts';
const originalFetch=globalThis.fetch;
const token='OFFICE_DELIVERY_6C9E';
const results=[];
for(const structured of [false,true]) {
 for(const spelling of ['snake','camel','absent']) {
  let wire,upstream;
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(init.body);
   if(spelling==='camel'){body.systemInstruction=body.system_instruction;delete body.system_instruction;}
   if(spelling==='absent')delete body.system_instruction;
   wire=body;
   const response=await originalFetch(url,{...init,body:JSON.stringify(body)});
   try{const data=await response.clone().json();upstream={status:response.status,modelVersion:data.modelVersion,finishReason:data.candidates?.[0]?.finishReason,parts:data.candidates?.[0]?.content?.parts?.map(p=>({text:p.text,thought:p.thought})),usage:data.usageMetadata,errorCode:data.error?.code};}catch{}
   return response;
  };
  const start=Date.now();
  const response=await generateGeminiText({
   systemInstruction: structured ? `Set answer to the exact literal ${token}. Do not answer arithmetic. Return only the requested JSON.` : `Return only the exact literal ${token}. No punctuation, JSON, explanation or arithmetic.`,
   prompt:structured?'What is 2+2? Return JSON with the answer in the answer field.':'What is 2+2? Answer the arithmetic question in Korean.',
   model:'gemini-3.5-flash',maxOutputTokens:4096,thinkingLevel:'high',signal:AbortSignal.timeout(45000),
   ...(structured?{responseJsonSchema:{type:'object',additionalProperties:false,properties:{answer:{type:'string'}},required:['answer']}}:{})
  });
  globalThis.fetch=originalFetch;
  const row={structured,spelling,elapsedMs:Date.now()-start,wire,promptHash:createHash('sha256').update(JSON.stringify(wire)).digest('hex'),response,upstream};results.push(row);
  writeFileSync('/tmp/moonlight-office-system-delivery.json',JSON.stringify({model:'gemini-3.5-flash',apiHost:new URL(getGeminiIntegrationStatus().apiBaseUrl).host,token,results},null,2));
  process.stdout.write(JSON.stringify({structured,spelling,elapsedMs:row.elapsedMs,ok:response.ok,text:response.text,actualModel:upstream?.modelVersion,finishReason:upstream?.finishReason})+'\n');
 }
}
