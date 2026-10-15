import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { DEFAULT_CIPHERS } from 'node:tls';
import { inflateRawSync } from 'node:zlib';

const MAX_BYTES=1024*1024, MAX_TEXT=18000;
const USER_AGENT='MoonlightResearch/1.0';
// Publishers' public feeds/listings discover original documents. Feed descriptions
// and Brave snippets are never treated as original-document evidence.
const OFFICIAL_SOURCES={
  '22nomad':[
    {url:'https://openai.com/news/rss.xml',kind:'feed'},
    {url:'https://blog.google/products-and-platforms/products/gemini/rss/',kind:'feed'},
  ],
  'class.moon':[{url:'https://www.moe.go.kr/boardCnts/listRenew.do?boardID=294&m=020402&s=moe',kind:'moe'}],
  'politic_officer':[
    {url:'https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardList.do?bbsId=BBSMSTR_000000000008',kind:'mois'},
    {url:'https://news.un.org/feed/subscribe/en/news/all/rss.xml',kind:'feed'},
  ],
};
export function isPublicAddress(address) {
  const family=isIP(address);
  if (family===4) {
    const [a,b]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===100&&b>=64&&b<=127)||(a===198&&[18,19,51].includes(b))||(a===203&&b===0));
  }
  // Permit global unicast only. IPv4-mapped/compatible, loopback, multicast,
  // unique-local, link-local and transition mechanisms are rejected.
  return family===6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:(?:0:|db8:|2:|10:|20:)/i.test(address) && !/^2002:/i.test(address);
}
export function canonicalResearchUrl(value) {
  try {
    if(typeof value!=='string'||value.length>2000) return null;
    const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||host==='localhost'||host.endsWith('.local')||host.endsWith('.localhost')||(!isIP(host)&&(!host.includes('.')||host.endsWith('.internal')))||(isIP(host)&&!isPublicAddress(host))) return null;
    url.hash='';url.pathname=url.pathname.replace(/;jsessionid=[^/;]*/gi,'');for(const key of [...url.searchParams.keys()]) if(/^utm_/i.test(key)||['gclid','fbclid','jsessionid'].includes(key.toLowerCase())) url.searchParams.delete(key);url.searchParams.sort();return url.toString();
  } catch {return null;}
}
function requestPinned(url,address,{maxBytes,timeoutMs}) {
  return new Promise((resolve,reject)=>{
    let settled=false;const end=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const req=httpsRequest(url,{method:'GET',ciphers:`${DEFAULT_CIPHERS}:!DHE`,headers:{'user-agent':USER_AGENT,accept:'text/html,application/xml,text/xml,text/plain','accept-encoding':'identity'},lookup:(_host,options,callback)=>callback(null,options?.all?[address]:address.address,address.family)},res=>{
      const chunks=[];let length=0;
      if(Number(res.headers['content-length']||0)>maxBytes){req.destroy(Error('source-too-large'));return;}
      res.on('data',chunk=>{length+=chunk.length;if(length>maxBytes)req.destroy(Error('source-too-large'));else chunks.push(chunk);});
      res.on('end',()=>{const bodyBytes=Buffer.concat(chunks);end(null,{status:res.statusCode,headers:res.headers,body:bodyBytes.toString('utf8'),bodyBytes});});res.on('error',error=>end(error));
    });
    const timer=setTimeout(()=>req.destroy(Error('source-timeout')),timeoutMs);req.on('error',error=>end(error));req.end();
  });
}
export async function fetchPublicSource(value,{lookup=host=>dnsLookup(host,{all:true}),request=requestPinned,maxBytes=MAX_BYTES,timeoutMs=7000,maxRedirects=3}={}) {
  let url=canonicalResearchUrl(value);if(!url)throw Error('unsafe-url');
  const deadline=Date.now()+timeoutMs;
  for(let hop=0;hop<=maxRedirects;hop++) {
    const host=new URL(url).hostname.replace(/^\[|\]$/g,'');
    const addresses=await Promise.race([lookup(host),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('source-timeout')),Math.max(1,deadline-Date.now()));timer.unref?.();})]);
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(row=>!isPublicAddress(row.address)))throw Error('unsafe-address');
    const result=await request(url,addresses[0],{maxBytes,timeoutMs:Math.max(1,deadline-Date.now())});
    if((result.bodyBytes?.length??Buffer.byteLength(result.body||'','utf8'))>maxBytes)throw Error('source-too-large');
    if([301,302,303,307,308].includes(result.status)) {if(hop===maxRedirects)throw Error('redirect-limit');url=canonicalResearchUrl(new URL(result.headers.location,url).toString());if(!url)throw Error('unsafe-redirect');continue;}
    if(result.status<200||result.status>=300)throw Error(`source-http-${result.status}`);
    const contentType=String(result.headers['content-type']||'').toLowerCase();
    if(!/text\/(html|plain|xml)|application\/(xml|rss\+xml|atom\+xml|octet-stream|zip|x-hwp|hwpx)/.test(contentType))throw Error('unsupported-source-type');
    return {url,body:result.body,bodyBytes:result.bodyBytes,contentType};
  }
  throw Error('redirect-limit');
}
function decodeText(text) {return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{const num=code.startsWith('x')?parseInt(code.slice(1),16):Number(code);return num>0&&num<=0x10ffff?String.fromCodePoint(num):'';}).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity]);}
function plain(text){return decodeText(String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function contentBlock(html,pattern) {
  const opening=html.match(pattern);if(!opening)return null;
  const start=opening.index+opening[0].length,tag=opening[1],tags=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi');tags.lastIndex=start;let depth=1,match;
  while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0)return html.slice(start,match.index);}return null;
}
function hwpxText(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)throw Error('unsupported-source-type');
  let directory=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){directory=i;break;}
  if(directory<0)throw Error('invalid-hwpx');const count=bytes.readUInt16LE(directory+10);let offset=bytes.readUInt32LE(directory+16),size=0;const sections=[];
  if(count>500)throw Error('hwpx-too-large');
  for(let i=0;i<count;i++) {
    if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)throw Error('invalid-hwpx');
    const method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),length=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42),name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if(/^Contents\/section\d+\.xml$/i.test(name)) {
      if(sections.length>=16||length>1024*1024||local+30>bytes.length||(bytes.readUInt16LE(offset+8)&1))throw Error('hwpx-too-large');
      const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>bytes.length)throw Error('invalid-hwpx');
      const packed=bytes.subarray(start,start+compressed),unpacked=method===0?packed:method===8?inflateRawSync(packed,{maxOutputLength:1024*1024}):null;
      if(!unpacked||unpacked.length!==length)throw Error('invalid-hwpx');size+=unpacked.length;if(size>2*1024*1024)throw Error('hwpx-too-large');
      const originalText=[...unpacked.toString('utf8').matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>|<\/hp:p>/g)].map(match=>match[1]===undefined?'\n':match[1]).join('');
      sections.push({name,text:originalText});
    }
    offset+=46+nameLength+extra+comment;
  }
  if(!sections.length)throw Error('no-hwpx-text');return sections.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map(section=>section.text).join('\n');
}
export function extractSourceDocument({url,body,bodyBytes,contentType='text/html',title:providedTitle}) {
  const canonical=canonicalResearchUrl(url);if(!canonical)throw Error('unsafe-url');
  if(/application\/(octet-stream|zip|x-hwp|hwpx)/.test(contentType)){body=hwpxText(bodyBytes);contentType='text/plain';}
  const title=plain(providedTitle||body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname).slice(0,240);
  let cleaned=String(body).replace(/<!--([\s\S]*?)-->/g,'').replace(/<(script|style|nav|header|footer|aside)[\s>][\s\S]*?<\/\1>/gi,'');
  if(contentType.includes('html')) cleaned=contentBlock(cleaned,/<(div)\b[^>]*(?:id=["']desc_pc["']|id=["']hwpEditorBoardContent["']|class=["']synapTextWrap["']|data-component=["']uni-article-body["'])[^>]*>/i)||cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||cleaned;
  const blocks=cleaned.replace(/<\/(?:p|div|li|h[1-6]|section|tr)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ').split(/\n+/).map(plain).filter(value=>value.length>15);
  const text=blocks.map((value,index)=>`L${index+1}: ${value}`).join('\n').slice(0,MAX_TEXT);
  const documentHash=createHash('sha256').update(text).digest('hex');
  return {url:canonical,title,text,documentHash,accessLevel:'full-text',fetchedAt:new Date().toISOString(),truncated:blocks.join('\n').length>MAX_TEXT};
}
function robotsAllows(body,path) {
  const groups=[];let group=null,inRules=false;
  for(const raw of body.split('\n')) {const line=raw.split('#')[0].trim(),match=line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);if(!match)continue;
    const key=match[1].toLowerCase(),value=match[2].trim();
    if(key==='user-agent'){if(!group||inRules){group={agents:[],rules:[]};groups.push(group);inRules=false;}group.agents.push(value.toLowerCase());}
    else if(group){group.rules.push({allow:key==='allow',path:value});inRules=true;}}
  const specific=groups.filter(g=>g.agents.some(agent=>agent!=='*'&&USER_AGENT.toLowerCase().includes(agent)));
  const rules=(specific.length?specific:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules).filter(rule=>rule.path&&new RegExp(`^${rule.path.split('*').map(part=>part.replace(/[.+?^{}()|[\]\\]/g,'\\$&')).join('.*').replace(/\$$/,'$')}`).test(path));
  rules.sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));return !rules.length||rules[0].allow;
}
export function createRespectfulSourceReader({read=fetchPublicSource}={}) {
  const cache=new Map();
  return async url=>{
    const target=new URL(url);let permission=cache.get(target.origin);
    if(!permission){permission=(async()=>{try{return (await read(`${target.origin}/robots.txt`)).body;}catch(error){if(/source-http-(404|410)/.test(error.message))return '';throw Error('robots-unconfirmed');}})();cache.set(target.origin,permission);}
    if(!robotsAllows(await permission,`${target.pathname}${target.search}`))throw Error('robots-disallowed');
    return read(url);
  };
}
export function createResearchSourceReader({read=createRespectfulSourceReader()}={}) {
  return async url=>{
    const response=await read(url),target=new URL(response.url);
    if(target.hostname==='www.moe.go.kr'&&target.pathname.includes('/viewRenew.do')) {
      const article=contentBlock(response.body,/<(div)\b[^>]*class=["']synapTextWrap["'][^>]*>/i);
      if(article&&plain(article).length<100) {
        const links=[...response.body.matchAll(/<a\b[^>]*href=["']([^"']*\/fileDown\.do[^"']*)["'][^>]*>/gi)];
        const attachment=links.find(match=>/\.hwpx\b/i.test(response.body.slice(Math.max(0,match.index-600),match.index)));
        if(attachment){const document=await read(new URL(decodeText(attachment[1]),response.url).toString());return {...document,title:plain(response.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'교육부 공개 원문')};}
      }
    }
    return response;
  };
}
export async function discoverOfficialSources(brand,{read=createRespectfulSourceReader(),maxCandidates=8}={}) {
  const candidates=[],failures=[];
  const adapters=OFFICIAL_SOURCES[brand]||[],perAdapter=Math.ceil(maxCandidates/Math.max(1,adapters.length));
  for(const adapter of adapters) {
    try {
      const result=await read(adapter.url);let entries=[];
      if(adapter.kind==='feed')entries=[...result.body.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(match=>{const entry=match[1];return {url:plain(entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]||entry.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]||''),title:plain(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')};});
      else {
        entries=[...result.body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].filter(match=>adapter.kind==='moe'?/boardCnts\/viewRenew\.do.*boardSeq=/.test(match[1]):/commonSelectBoardArticle\.do.*nttId=/.test(match[1])&&match[1].includes('BBSMSTR_000000000008')).map(match=>({url:new URL(decodeText(match[1]),result.url).toString(),title:plain(match[2])}));
        if(adapter.kind==='moe')for(const match of result.body.matchAll(/<a\b[^>]*onclick=["'][^"']*goView\(\s*'294',\s*'(\d+)'[\s\S]*?title=["']([^"']+)["'][^>]*>/gi)) entries.push({url:`https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=${match[1]}&lev=0&searchType=null&statusYN=W&page=1&s=moe&m=020402&opType=N`,title:plain(match[2])});
      }
      let accepted=0;for(const entry of entries){const url=canonicalResearchUrl(entry.url);if(url&&!candidates.some(item=>item.url===url)){candidates.push({url,title:entry.title,official:true,adapterUrl:adapter.url});accepted++;}if(accepted>=perAdapter||candidates.length>=maxCandidates)break;}
    }catch(error){failures.push({source:adapter.kind,reason:boundedSourceError(error)});}
    if(candidates.length>=maxCandidates)break;
  }
  return {candidates,failures};
}
export function boundedSourceError(error) {const code=String(error?.message||'source-fetch-failed');return /^[a-z0-9-]{1,80}$/.test(code)?code:'source-fetch-failed';}
