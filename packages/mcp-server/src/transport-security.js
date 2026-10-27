const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]']);
const PRIVATE_FIELD=/(?:accesstoken|refreshtoken|appsecret|clientsecret|apikey|password|authorization|cookie|servicerolekey|agentapitoken|hubwritesecret)$/i;

// Credentials go only to the configured Hub origin, over TLS except on loopback.
export function hubEndpoint(path,{agent=false,base=process.env.COM_MOON_HUB_URL?.trim()||'http://localhost:3000'}={}){
  let origin;
  try{
    const parsed=new URL(base);
    if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||
      !(parsed.protocol==='https:'||parsed.protocol==='http:'&&LOOPBACK.has(parsed.hostname)))throw Error();
    origin=parsed.origin;
  }catch{throw new Error('invalid-hub-url');}
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('\\'))throw new Error('invalid-hub-path');
  const url=new URL(agent?`/api/agent/v1${path}`:path,origin);
  if(url.origin!==origin||url.hash||!url.pathname.startsWith(agent?'/api/agent/v1/':'/api/'))throw new Error('invalid-hub-path');
  return {base:origin,url};
}

export async function boundedJson(response,maxBytes){
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new Error('response-too-large');}
  const reader=response.body?.getReader();let size=0;const chunks=[];
  if(reader)try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new Error('response-too-large');}chunks.push(value);}
  }finally{reader.releaseLock();}
  if(!size)throw new Error('empty-response');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new Error('non-json-response');}
}

// Recovery receipts intentionally retain their signed recoveryToken. Provider credentials
// and the server's own credentials have no place in either MCP result representation.
export function sanitizeToolResult(result,env=process.env){
  const secrets=[env.COM_MOON_AGENT_API_TOKEN,env.COM_MOON_HUB_WRITE_SECRET].filter(value=>typeof value==='string'&&value.length>=8);
  const redactText=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),value);
  const redact=value=>JSON.parse(JSON.stringify(value,(key,item)=>
    item!=null&&typeof item!=='boolean'&&PRIVATE_FIELD.test(key.replace(/[^a-z0-9]/gi,''))?'[redacted]':typeof item==='string'?redactText(item):item));
  return {...result,
    ...(result.structuredContent!==undefined?{structuredContent:redact(result.structuredContent)}:{}),
    content:result.content.map(block=>{
      if(block.type!=='text')return block;
      try{return {...block,text:JSON.stringify(redact(JSON.parse(block.text)))};}
      catch{return {...block,text:redactText(block.text)};}
    }),
  };
}
