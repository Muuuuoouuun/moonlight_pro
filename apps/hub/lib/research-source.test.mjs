import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { isPublicAddress, canonicalResearchUrl, fetchPublicSource, extractSourceDocument, discoverOfficialSources, createResearchSourceReader } from './research-source.js';

test('public source URLs and DNS reject private, mapped, reserved and credentialed addresses', () => {
  for (const address of ['127.0.0.1','10.2.3.4','169.254.169.254','192.168.1.2','0.0.0.0','100.64.0.1','198.18.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
  for (const url of ['http://example.org','https://user:pass@example.org','https://example.org:444','https://localhost','https://127.0.0.1','https://[::1]']) assert.equal(canonicalResearchUrl(url),null,url);
  assert.equal(canonicalResearchUrl('https://example.org/a?utm_source=x&b=2#hash'),'https://example.org/a?b=2');
});
test('redirects are independently DNS checked before any request to private endpoints', async () => {
  const visited=[];
  await assert.rejects(fetchPublicSource('https://example.org/a',{lookup:async host=>[{address:host==='example.org'?'8.8.8.8':'127.0.0.1',family:4}],request:async url=>{visited.push(url);return {status:302,headers:{location:'https://internal.example.org/secret'},body:''};}}),/unsafe-address/);
  assert.equal(visited.length,1);
});
test('all DNS answers must be public and oversized responses never become evidence', async () => {
  await assert.rejects(fetchPublicSource('https://example.org/a',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'10.1.1.1',family:4}],request:async()=>{throw Error('must not request');}}),/unsafe-address/);
  await assert.rejects(fetchPublicSource('https://example.org/a',{maxBytes:10,lookup:async()=>[{address:'8.8.8.8',family:4}],request:async()=>({status:200,headers:{'content-type':'text/html'},body:'x'.repeat(11)})}),/source-too-large/);
});
test('source extraction excludes scripts/navigation, numbers evidence lines and hashes source changes', () => {
  const a=extractSourceDocument({url:'https://example.org/a',body:'<title>Release</title><nav>Menu</nav><article><p>A new model is available today.</p><p>It requires a paid account.</p></article><script>secret</script>',contentType:'text/html'});
  assert.match(a.text,/L1: A new model/);assert.doesNotMatch(a.text,/Menu|secret/);
  assert.equal(a.documentHash.length,64);assert.notEqual(a.documentHash,extractSourceDocument({url:a.url,body:'<article>Changed release and new conditions.</article>',contentType:'text/html'}).documentHash);
});
test('official feed discovery extracts original URLs without passing feed descriptions as evidence', async () => {
  const result=await discoverOfficialSources('22nomad',{read:async url=>({url,body:'<rss><item><title>Release</title><link>https://openai.com/index/release/</link><description>Discovery only.</description></item></rss>',contentType:'text/xml'})});
  assert.equal(result.candidates[0].url,'https://openai.com/index/release/');assert.equal(result.candidates[0].snippet,undefined);
});
test('canonical source identity strips session paths and official listings exclude site navigation',async()=>{
  assert.equal(canonicalResearchUrl('https://example.org/release;jsessionid=changing?b=2'),'https://example.org/release?b=2');
  const result=await discoverOfficialSources('politic_officer',{read:async url=>({url,body:'<a href="/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000031&nttId=123335">Budget menu</a><a href="/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=129840">Current official release</a>',contentType:'text/html'})});
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].title,'Current official release');
});
test('feed CDATA titles survive parsing and bounded discovery preserves source diversity',async()=>{
  const result=await discoverOfficialSources('22nomad',{maxCandidates:2,read:async url=>({url,body:`<rss><item><title><![CDATA[First release]]></title><link>https://${url.includes('openai')?'openai.com':'blog.google'}/a</link></item><item><title>Next release</title><link>https://${url.includes('openai')?'openai.com':'blog.google'}/b</link></item></rss>`,contentType:'text/xml'})});
  assert.equal(result.candidates[0].title,'First release');assert.equal(new URL(result.candidates[1].url).hostname,'blog.google');
});
test('MOE current listing parses goView arguments and keeps required document access parameters',async()=>{
  const result=await discoverOfficialSources('class.moon',{read:async url=>({url,body:'<a href="#" onclick="javascript:goView(\'294\', \'107331\', \'0\', null, \'W\', \'1\', \'N\', \'\');" title="Current education release">Release</a>',contentType:'text/html'})});
  assert.equal(result.candidates.length,1);assert.equal(new URL(result.candidates[0].url).searchParams.get('statusYN'),'W');assert.equal(result.candidates[0].title,'Current education release');
});
test('publisher content blocks exclude navigation and multiline HTML attributes from evidence',()=>{
  const result=extractSourceDocument({url:'https://example.org/a',body:'<div>Unrelated navigation menu.</div><div id="hwpEditorBoardContent"><div><p>Original release facts are here.</p></div></div><div>Other release navigation.</div>',contentType:'text/html'});
  assert.equal(result.text,'L1: Original release facts are here.');
  const multiline=extractSourceDocument({url:'https://example.org/a',body:'<article><div\n class="foo"\n data-details="private attributes"><p>Real document body text.</p></div></article>'});assert.doesNotMatch(multiline.text,/attributes|class|details/);
});
test('MOIS reads actual desc_pc release body rather than embedded HWP editor JSON metadata',()=>{
  const result=extractSourceDocument({url:'https://www.mois.go.kr/a',body:'<div>Navigation content.</div><div id="desc_pc" class="desc"><p>The minister announced updated disaster training.</p><div id="hwpEditorBoardContent"><!--[data-hwpjson]{"metadata":"Office editor data"}--></div></div>'});
  assert.equal(result.text,'L1: The minister announced updated disaster training.');
});
test('title-only MOE pages read actual public HWPX attachment before becoming evidence',async()=>{
  const visits=[];const read=createResearchSourceReader({read:async url=>{visits.push(url);return url.includes('fileDown')?{url,body:'',bodyBytes:Buffer.from('PK'),contentType:'application/octet-stream'}:{url,body:'<div class="synapTextWrap">Only the title.</div><li><span>Release.hwpx</span><a href="/boardCnts/fileDown.do?fileSeq=abc">Download</a></li>',contentType:'text/html'};}});
  const result=await read('https://www.moe.go.kr/boardCnts/viewRenew.do?boardSeq=1');assert.equal(visits.length,2);assert.match(result.url,/fileDown/);
});
test('HWPX extraction reads original text only and rejects oversized decompression metadata',()=>{
  const raw=Buffer.from('<hp:section><hp:shapeComment>Private picture metadata.</hp:shapeComment><hp:p><hp:t>The ministry published new admission guidance.</hp:t></hp:p></hp:section>'),packed=deflateRawSync(raw),name=Buffer.from('Contents/section0.xml');
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);
  const offset=local.length+name.length+packed.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(offset,16);
  const archive=Buffer.concat([local,name,packed,central,name,end]);
  const document=extractSourceDocument({url:'https://example.org/release.hwpx',body:'',bodyBytes:archive,contentType:'application/octet-stream'});
  assert.equal(document.text,'L1: The ministry published new admission guidance.');
  archive.writeUInt32LE(2*1024*1024,offset+24);assert.throws(()=>extractSourceDocument({url:'https://example.org/release.hwpx',body:'',bodyBytes:archive,contentType:'application/octet-stream'}),/hwpx-too-large/);
});
