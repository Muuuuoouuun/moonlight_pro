// macOS: LC_ALL 이 없으면 postmaster 가 기동 중 multithreaded 로 판정되어
// `FATAL: postmaster became multithreaded during startup` 으로 죽는다 (2026-09-19).
// DB 로케일은 initdb --no-locale 로 이미 C 이므로 동작은 바뀌지 않는다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Opt-in disposable socket-only cluster. Never loads .env or an existing DB.
const enabled = process.env.JOURNAL_POSTGRES_TEST === '1';
const root = new URL('../../../', import.meta.url);
const migration = new URL('supabase/migrations/20260920_0035_journal_tags_search.sql', root);
const W='11111111-1111-4111-8111-111111111111', O='22222222-2222-4222-8222-222222222222';
const id=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
test('journal search PostgreSQL literal filters, paging, boundaries, isolation and rights', {skip:!enabled},async t=>{
  assert.equal(existsSync(migration),true,'journal search migration must exist');
  const directory=mkdtempSync(join(tmpdir(),'journal-search-pg-')),data=join(directory,'data');
  const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',directory,'-p','55494','-U','journal_search_test','-d','postgres'];
  const sql=source=>execFileSync('psql',args,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const search=(extra={})=>{
    const p={workspace:W,q:'',from:null,to:null,kind:'',type:'',context:null,used:'all',before:null,beforeId:null,limit:40,...extra};
    return JSON.parse(sql(`select public.journal_search_v1(${[p.workspace,p.q,p.from,p.to,p.kind,p.type,p.context,p.used,p.before,p.beforeId].map(literal).join(',')},${p.limit});`));
  };
  const insert=(n,{workspace=W,title='',body='원문',enhancement='',kind='note',at='2026-09-13T01:00:00Z'}={})=>sql(`insert into public.journal_entries(id,workspace_id,entry_kind,title,body,note_meta,occurred_at) values('${id(n)}','${workspace}','note',${literal(title)},${literal(body)},${literal(JSON.stringify({kind,enhancement}))}::jsonb,${literal(at)});`);
  let started=false;
  try{
    execFileSync('initdb',['-D',data,'-U','journal_search_test','-A','trust','--no-locale','--encoding=UTF8'],{ stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });
    execFileSync('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-F -k ${directory} -p 55494 -c listen_addresses=''`,'-w','start'],{ stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });started=true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
    for(const file of ['supabase/setup/00_live_schema.sql','supabase/migrations/20260617_0007_content_idea_cadence.sql','supabase/migrations/20260718_0021_task_description.sql','supabase/migrations/20260912_0025_daily_review_journal.sql','supabase/migrations/20260912_0026_content_workflow.sql','supabase/migrations/20260913_0027_journal_notes.sql','supabase/migrations/20260913_0030_journal_search.sql'])sql(readFileSync(new URL(file,root),'utf8'));
    sql(readFileSync(migration,'utf8'));
    sql(`insert into public.workspaces(id,name,slug) values('${W}','Search','search'),('${O}','Other','other');
      insert into public.projects(id,workspace_id,name) values('${id(1000)}','${W}','프로젝트'),('${id(1001)}','${O}','외부 프로젝트');
      insert into public.leads(id,workspace_id,name) values('${id(1002)}','${W}','리드');
      insert into public.customer_accounts(id,workspace_id,name) values('${id(1003)}','${W}','계정');
      insert into public.brands(id,workspace_id,name,slug) values('${id(1004)}','${W}','브랜드','brand');`);
    for(let n=1;n<=45;n++)insert(n);
    await t.test('search reaches older records beyond the newest 40 and never returns full text',()=>{
      insert(50,{body:'오래된 증거',at:'2025-01-01T00:00:00Z'});
      assert.equal(search().entries.length,41);
      const found=search({q:'오래된'});assert.equal(found.status,'live');assert.deepEqual(found.entries.map(r=>r.id),[id(50)]);
      assert.equal(Object.hasOwn(found.entries[0],'body'),false);assert.deepEqual(found.entries[0].noteMeta,{kind:'note'});
    });
    await t.test('matches title, body and enhancement in order with near-match snippets',()=>{
      insert(51,{title:'Title TOKEN',body:'body token'});insert(52,{body:'앞'.repeat(400)+' body Token 뒤'});insert(53,{enhancement:'앞'.repeat(400)+' 🌓 한글 ToKeN 보강'});
      const found=search({q:'token'});assert.deepEqual(found.entries.map(r=>r.match.field),['enhancement','body','title']);
      for(const entry of found.entries){assert.ok(entry.match.text.toLowerCase().includes('token'));assert.ok([...entry.match.text].length<=180);assert.ok([...entry.excerpt].length<=180);}
      assert.deepEqual(search({q:'🌓 한글'}).entries.map(r=>r.id),[id(53)]);
    });
    await t.test('tag saves roundtrip through revisions, idempotency and literal search', () => {
      const command = { action: 'save', entryId: id(900), expectedRevision: 0, body: '태그 없는 본문', title: '', occurredAt: '2026-09-13T01:00:00Z', noteMeta: { kind: 'idea', enhancement: '', tags: ['후속 연락', 'a%_\\*', 'Token'] }, contexts: [] };
      const save = (value, requestId) => JSON.parse(sql(`select public.journal_workflow_v1('${W}','${id(requestId)}',${literal(JSON.stringify(value))}::jsonb)`));
      const saved = save(command, 901);
      assert.equal(saved.status, 'saved');
      assert.deepEqual(saved.entry.note_meta, command.noteMeta);
      assert.equal(save(command, 901).status, 'duplicate');
      for (const q of ['후속', 'a%_\\*']) {
        const found = search({ q });
        assert.equal(found.status, 'live');
        assert.deepEqual(found.entries.map(row => row.id), [id(900)]);
        assert.equal(found.entries[0].match.field, 'tags');
        assert.ok(found.entries[0].match.text.includes(q));
      }
      assert.equal(search({ q: 'token' }).entries.find(row => row.id === id(900)).match.field, 'tags');
      const updated = { ...command, expectedRevision: 1, noteMeta: { ...command.noteMeta, tags: [] } };
      assert.equal(save(updated, 902).entry.note_revision, 2);
      assert.equal(search({ q: '후속' }).entries.length, 0);
      assert.deepEqual(JSON.parse(sql(`select snapshot->'note_meta'->'tags' from public.journal_note_revisions where journal_id='${id(900)}' and revision=1`)), command.noteMeta.tags);
      assert.equal(save({ ...updated, expectedRevision: 1 }, 903).status, 'conflict');
    });
    await t.test('long literal matches reserve snippet space before adding leading context',()=>{
      for(const length of [150,180,200]) {
        const q='가'.repeat(length);
        insert(400+length,{body:'앞'.repeat(100)+q+' 뒤'});
        const entry=search({q}).entries.find(row=>row.id===id(400+length));
        const prefix=Math.min(40,Math.max(0,180-length));
        assert.equal(entry.match.field,'body');
        assert.equal(entry.match.text,'앞'.repeat(prefix)+q.slice(0,180-prefix));
        assert.equal([...entry.match.text].length,180);
        if(length<=180)assert.ok(entry.match.text.includes(q));
        else assert.ok(entry.match.text.startsWith(q.slice(0,180)));
      }
    });
    await t.test('wildcards, punctuation and backslash remain literal',()=>{
      insert(54,{body:'a%_\\*(, 단어'});insert(55,{body:'ordinary anything'});
      for(const q of ['%','_','\\','*','a%_\\*(,'])assert.deepEqual(search({q}).entries.map(r=>r.id),[id(54)]);
    });
    await t.test('same timestamp pages remain stable and preserve microseconds',()=>{
      for(let n=60;n<=66;n++)insert(n,{title:'paging',at:'2026-09-13T02:00:00.123456Z'});
      const first=search({q:'paging',limit:3});assert.deepEqual(first.entries.map(r=>r.id),[66,65,64,63].map(id));
      const last=first.entries[2];const second=search({q:'paging',limit:3,before:last.occurredAt,beforeId:last.id});assert.deepEqual(second.entries.map(r=>r.id),[63,62,61,60].map(id));
      const end=second.entries[2];assert.deepEqual(search({q:'paging',limit:3,before:end.occurredAt,beforeId:end.id}).entries.map(r=>r.id),[id(60)]);
    });
    await t.test('KST start is inclusive and next midnight is exclusive',()=>{
      for(const [n,at] of [[70,'2026-09-12T14:59:59.999999Z'],[71,'2026-09-12T15:00:00Z'],[72,'2026-09-13T14:59:59.999999Z'],[73,'2026-09-13T15:00:00Z']])insert(n,{title:'boundary',at});
      assert.deepEqual(search({q:'boundary',from:'2026-09-12T15:00:00Z',to:'2026-09-13T15:00:00Z'}).entries.map(r=>r.id),[id(72),id(71)]);
    });
    await t.test('context and use EXISTS filters are ANDed and never duplicate notes',()=>{
      insert(80,{title:'linked',kind:'idea'});insert(81,{title:'linked',kind:'idea'});
      for(const [type,n] of [['project',1000],['lead',1002],['account',1003],['brand',1004]])sql(`insert into public.journal_links(workspace_id,journal_id,link_kind,target_type,target_id,source_revision) values('${W}','${id(80)}','context','${type}','${id(n)}',1);`);
      for(const n of [2000,2001])sql(`insert into public.journal_links(workspace_id,journal_id,link_kind,target_type,target_id,source_revision) values('${W}','${id(80)}','use','task','${id(n)}',1);`);
      for(const [type,n] of [['project',1000],['lead',1002],['account',1003],['brand',1004]]){const result=search({q:'linked',type,context:id(n),used:'used',kind:'idea'});assert.deepEqual(result.entries.map(r=>r.id),[id(80)]);assert.equal(result.context.type,type);assert.equal(result.entries[0].used,true);}
      assert.deepEqual(search({q:'linked',used:'unused',kind:'idea'}).entries.map(r=>r.id),[id(81)]);
      assert.equal(search({q:'linked',kind:'decision'}).entries.length,0);
    });
    await t.test('foreign workspace, absent and deleted contexts return explicit errors',()=>{
      insert(90,{workspace:O,title:'private only'});assert.equal(search({q:'private only'}).entries.length,0);
      for(const context of [id(1001),id(9999)])assert.equal(search({type:'project',context}).status,'error');
      sql(`delete from public.projects where id='${id(1000)}'`);assert.equal(search({type:'project',context:id(1000)}).status,'error');
      assert.equal(search({q:'linked'}).entries.length,2);
      assert.equal(search({workspace:id(9999)}).status,'error');
      sql(`select public.save_daily_review_v1('${W}','2026-09-13','Asia/Seoul',2,'목표','0','reviewonly',0,'${id(3000)}')`);
      assert.equal(search({q:'reviewonly'}).entries.length,0);
    });
    await t.test('RPC validates filters and cursor pair even for direct service callers',()=>{
      for(const extra of [{q:null},{q:'a'.repeat(201)},{kind:'bad'},{type:'task',context:id(1002)},{type:'lead'},{context:id(1002)},{used:'bad'},{limit:4},{limit:'null'},{before:'2026-09-13T01:00:00Z'},{beforeId:id(1)},{from:'2026-09-14',to:'2026-09-13'}])assert.equal(search(extra).status,'error',JSON.stringify(extra));
    });
    await t.test('service-only permissions and migration reapply preserve rows',()=>{
      const signature='public.journal_search_v1(uuid,text,timestamp with time zone,timestamp with time zone,text,text,uuid,text,timestamp with time zone,uuid,integer)';
      for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}',${literal(signature)},'EXECUTE')`),'f');
      assert.equal(sql(`select has_function_privilege('service_role',${literal(signature)},'EXECUTE')`),'t');
      const before=sql('select count(*) from public.journal_entries');sql(readFileSync(migration,'utf8'));assert.equal(sql('select count(*) from public.journal_entries'),before);
      const service=JSON.parse(sql(`set role service_role; select public.journal_search_v1('${W}','linked');`));assert.equal(service.status,'live');
    });
  }finally{if(started)execFileSync('pg_ctl',['-D',data,'-m','fast','-w','stop'],{ stdio: 'pipe', env: { ...process.env, LC_ALL: process.env.LC_ALL || 'C' } });rmSync(directory,{recursive:true,force:true});}
});
