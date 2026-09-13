const BODY_LIMIT=64*1024;
const TERMINAL=new Set(['succeeded','failed','cancelled','needs_attention']);
class InputError extends Error { constructor(status,message){super(message);this.status=status;} }
export function agentJson({httpStatus=200,data}){
  return Response.json(data,{status:httpStatus,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export async function readAgentJson(request,bodyLimit=BODY_LIMIT){
  const declared=Number(request.headers.get('content-length'));
  if(declared>bodyLimit)throw new InputError(413,`Request body exceeds ${bodyLimit/1024} KiB.`);
  const reader=request.body?.getReader();let length=0;const chunks=[];
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>bodyLimit){await reader.cancel();throw new InputError(413,`Request body exceeds ${bodyLimit/1024} KiB.`);}chunks.push(value);}}finally{reader.releaseLock();}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new InputError(400,'Request body must be valid JSON.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new InputError(400,'Request body must be an object.');
  return data;
}
const wait=(ms,signal)=>new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});
export function jobEventStream(request,job,id,context,first,initialAfter){
  let cancelled=false;
  const stream=new ReadableStream({
    async start(controller){
      const encoder=new TextEncoder();const send=text=>{if(!cancelled)controller.enqueue(encoder.encode(text));};
      let after=initialAfter,result=first;const started=Date.now();
      try{
        send('retry: 2000\n\n');
        while(!cancelled&&!request.signal.aborted&&Date.now()-started<25_000){
          const d=result.data;
          if(result.httpStatus>=400||d?.status==='error'){send(`event: failure\ndata: ${JSON.stringify(d)}\n\n`);break;}
          for(const event of d?.events||[]){
            if(!Number.isSafeInteger(event.seq)||event.seq<=after)continue;
            send(`id: ${event.seq}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);after=event.seq;
          }
          if(!TERMINAL.has(d?.jobState)||!d?.hasMore)send(`event: state\ndata: ${JSON.stringify({state:d?.jobState,after})}\n\n`);
          if(TERMINAL.has(d?.jobState)&&!d?.hasMore)break;
          if(!d?.hasMore)await wait(1500,request.signal);
          if(cancelled||request.signal.aborted)break;
          result=await job('events',{id,after},context);
        }
      }catch{if(!cancelled)send('event: failure\ndata: {"status":"error","error":"Event stream interrupted. Reconnect with the last event ID."}\n\n');}
      finally{if(!cancelled)controller.close();}
    },cancel(){cancelled=true;},
  });
  return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'}});
}

export function createAgentHttpHandler(operation,deps={}){
  return async(request,routeContext={})=>{
    try{
      const scope=['jobs','job','events','projects'].includes(operation)?'jobs:read':['submit','cancel','resume'].includes(operation)?'jobs:write':operation==='command'?null:'read';
      const authorize=deps.authorize||(await import('./auth.js')).authorizeAgentRequest;
      const auth=await authorize(request,{scope});if(!auth.ok)return agentJson(auth);
      const context=auth.context;
      const params=await routeContext.params||{};
      const query=Object.fromEntries(new URL(request.url).searchParams);
      let result;
      if(operation==='capabilities')result=await (deps.capabilities||(await import('./capabilities.js')).getAgentCapabilities)(context);
      else if(operation==='query')result=await (deps.query||(await import('./queries.js')).queryAgentData)(await readAgentJson(request),context);
      else if(operation==='entity')result=await (deps.entity||(await import('./queries.js')).getAgentEntity)(params.type,params.id,query,context);
      else if(operation==='receipt'){
        result=await (deps.receipt||(await import('./commands.js')).getAgentCommandReceipt)(params.id,context);
        if(result.data?.persisted===true)(deps.invalidate||(await import('./queries.js')).invalidateAgentQueryCache)({workspaceId:context.workspaceId});
      }
      else if(operation==='command'){
        result=await (deps.command||(await import('./commands.js')).executeAgentCommand)(await readAgentJson(request,256*1024),context);
        if(result.data?.persisted===true)(deps.invalidate||(await import('./queries.js')).invalidateAgentQueryCache)({workspaceId:context.workspaceId});
      }else{
        const job=deps.job||(await import('./jobs.js')).handleAgentJob;
        const action=operation==='jobs'?(query.view==='projects'?'projects':'list'):operation==='job'?'get':operation;
        const input=['submit','cancel','resume'].includes(action)?await readAgentJson(request):{};
        if(params.id)input.id=params.id;
        if(action==='events'){
          const raw=query.after??request.headers.get('last-event-id')??'0';const after=Number(raw);
          if(!Number.isSafeInteger(after)||after<0)throw new InputError(400,'Invalid event cursor.');
          input.after=after;
        }
        result=await job(action,input,context);
        if(action==='events'&&request.headers.get('accept')?.includes('text/event-stream')&&result.httpStatus<400&&result.data?.status!=='error')return jobEventStream(request,job,params.id,context,result,input.after);
      }
      return agentJson(result);
    }catch(error){return agentJson({httpStatus:error instanceof InputError?error.status:502,data:{status:'error',error:error instanceof InputError?error.message:'Agent request failed. Check the source connection before retrying.',retryable:false}});}
  };
}
