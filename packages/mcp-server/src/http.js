import http from 'node:http';
import {statSync} from 'node:fs';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMoonlightServer,version} from './server.js';
import {clientsFile,findClient,readClients} from './clients.js';

// Streamable HTTP for tools that cannot spawn a local process (automation SaaS, remote agents,
// editors that prefer URLs). Stateless: every POST gets a fresh server scoped to the caller's
// profile, so one client's grant can never leak into another's tool list.
const MAX_BODY_BYTES=512*1024;
const LOOPBACK_HOSTS=['localhost','127.0.0.1','[::1]'];
const csv=value=>String(value||'').split(',').map(item=>item.trim().toLowerCase()).filter(Boolean);
const hostOf=value=>/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(String(value||'').trim().toLowerCase())?.[1]||null;

// Re-reads the registry when it changes so `token revoke` takes effect without a restart.
// An unreadable registry fails closed (no client matches) rather than keeping stale grants.
export function clientStore(file,log=()=>{}){
  let key=null,clients=[];
  return ()=>{
    let stat;try{stat=statSync(file);}catch{key=null;clients=[];return clients;}
    const next=`${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if(next!==key){
      try{clients=readClients(file);key=next;}
      catch(error){clients=[];key=null;log(`client registry unreadable, rejecting every request: ${error.message}`);}
    }
    return clients;
  };
}

function rateLimiter(perMinute){
  const windows=new Map();
  return name=>{
    const now=Date.now();const window=windows.get(name);
    if(!window||now-window.start>=60_000){windows.set(name,{start:now,count:1});return 0;}
    return ++window.count<=perMinute?0:Math.ceil((window.start+60_000-now)/1000);
  };
}

// Oversized bodies are drained (not stored) so the caller gets a clean 413 instead of a reset
// connection; only a body far past the limit gets the socket cut.
function readBody(req){
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size<=MAX_BODY_BYTES)chunks.push(chunk);
      else if(size>MAX_BODY_BYTES*16)req.destroy();
    });
    req.on('end',()=>size>MAX_BODY_BYTES?reject(Object.assign(new Error('too-large'),{code:'too-large'})):resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('close',()=>{if(!req.complete)reject(Object.assign(new Error('aborted'),{code:'aborted'}));});
    req.on('error',reject);
  });
}

export function createHttpHandler({getClients,allowedHosts=[],allowedOrigins=[],readOnly=false,mode='auto',ratePerMinute=120,log=()=>{}}){
  const hosts=new Set([...LOOPBACK_HOSTS,...allowedHosts]);
  const origins=new Set(allowedOrigins);
  const limit=rateLimiter(ratePerMinute);
  return async(req,res)=>{
    const started=Date.now();
    const send=(status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(body));};
    // Rejections are logged too (status and reason only) so probing through a tunnel is visible.
    const fail=(status,code,message,headers)=>{log(`${new Date().toISOString()} rejected status=${status} ${message}`);send(status,{jsonrpc:'2.0',error:{code,message},id:null},headers);};
    // DNS-rebinding guard: a browser page can reach loopback, but not with our Host/Origin.
    if(!hosts.has(hostOf(req.headers.host)))return fail(403,-32000,'Host not allowed');
    if(req.headers.origin&&!origins.has(req.headers.origin.toLowerCase()))return fail(403,-32000,'Origin not allowed');
    const {pathname}=new URL(req.url,'http://localhost');
    if(pathname==='/healthz'&&req.method==='GET')return send(200,{ok:true,name:'moonlight',version});
    const route=/^\/mcp(?:\/([A-Za-z0-9_-]{1,200}))?\/?$/.exec(pathname);
    if(!route)return fail(404,-32000,'Not found');
    // A header wins; the path token is only for clients that cannot send headers and must be
    // enabled per client, because URLs end up in logs and connector settings.
    const bearer=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'');
    const clients=getClients();
    const pathClient=!bearer&&route[1]?findClient(clients,route[1]):null;
    const viaUrl=!bearer&&Boolean(pathClient?.allowUrl);
    const client=bearer?findClient(clients,bearer[1]):viaUrl?pathClient:null;
    if(!client)return fail(401,-32001,'Unauthorized',{'www-authenticate':'Bearer realm="moonlight"'});
    if(req.method!=='POST')return fail(405,-32000,'Method not allowed',{allow:'POST'});
    const retryAfter=limit(client.name);
    if(retryAfter)return fail(429,-32000,'Rate limit exceeded',{'retry-after':String(retryAfter)});
    let text,body;
    try{text=await readBody(req);}
    catch(error){return error.code==='too-large'?fail(413,-32000,'Request body too large'):undefined;}
    try{body=JSON.parse(text);}catch{return fail(400,-32700,'Parse error');}
    // Audit trail names the client and tool, never arguments (they carry customer data).
    const calls=[body].flat().map(message=>message?.method==='tools/call'?`tools/call:${String(message.params?.name||'?').slice(0,64)}`:String(message?.method||'response').slice(0,64));
    res.on('finish',()=>log(`${new Date().toISOString()} client=${client.name} ${calls.join(',')} status=${res.statusCode} ms=${Date.now()-started}`));
    let server,transport;
    res.on('close',()=>{transport?.close().catch(()=>{});server?.close().catch(()=>{});});
    try{
      // URL-token access is read-only even if the registry was edited by hand.
      ({server}=createMoonlightServer({profile:client.profile,mode,readOnly:readOnly||client.readOnly===true||viaUrl}));
      transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      await server.connect(transport);await transport.handleRequest(req,res,body);
    }
    catch(error){log(`request failed for client=${client.name}: ${error.message}`);if(!res.headersSent)fail(500,-32603,'Internal error');}
  };
}

export async function startHttpServer({host,port,env=process.env,log=line=>process.stderr.write(`${line}\n`)}={}){
  const bindHost=host||env.COM_MOON_MCP_HTTP_HOST||'127.0.0.1';
  const bindPort=Number(port??env.COM_MOON_MCP_HTTP_PORT??3333);
  const file=clientsFile(env);
  const getClients=clientStore(file,log);
  const handler=createHttpHandler({
    getClients,
    allowedHosts:csv(env.COM_MOON_MCP_ALLOWED_HOSTS),
    allowedOrigins:csv(env.COM_MOON_MCP_ALLOWED_ORIGINS),
    readOnly:env.COM_MOON_MCP_READ_ONLY==='1',
    mode:env.COM_MOON_MCP_API_MODE||'auto',
    ratePerMinute:Number(env.COM_MOON_MCP_HTTP_RATE_PER_MIN)||120,
    log,
  });
  const server=http.createServer((req,res)=>{handler(req,res).catch(error=>{log(`unhandled: ${error.message}`);if(!res.headersSent){res.writeHead(500);res.end();}});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(bindPort,bindHost,resolve);});
  const count=getClients().length;
  if(!['127.0.0.1','localhost','::1'].includes(bindHost))log(`WARNING: listening on ${bindHost}, not loopback. Every request still needs a client token and an allowed Host.`);
  log(`moonlight-mcp ${version} (http) — http://${bindHost.includes(':')?`[${bindHost}]`:bindHost}:${server.address().port}/mcp, clients=${count}${count?'':' — none registered yet: npm run mcp:connect -- token create <name>'}`);
  return server;
}
