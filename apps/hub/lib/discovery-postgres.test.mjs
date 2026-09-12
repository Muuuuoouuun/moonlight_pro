import assert from 'node:assert/strict';
import { execFileSync, execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
const migration=new URL('../../../supabase/migrations/20260913_0029_opportunity_discovery.sql',import.meta.url);
const available=process.getuid?.()!==0 && ['initdb','pg_ctl','psql'].every(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
const W='11111111-1111-4111-8111-111111111111', O='22222222-2222-4222-8222-222222222222';
const uuid=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const payload={id:uuid(1),requestId:uuid(10),expectedRevision:0,title:'운영 진단',orgScope:'personal',discoveryMode:'capture',status:'captured',evidence:'반복 문의',hypothesis:'',experiment:'',findings:'',decisionReason:'',resumeCondition:'',reviewDate:null,links:[]};
const lit=v=>`'${String(v).replaceAll("'","''")}'`;
const save=(patch={},workspace=W)=>`select public.save_discovery_v1('${workspace}'::uuid,${lit(JSON.stringify({...payload,...patch}))}::jsonb);`;
test('discovery migration is delivered',()=>assert.equal(existsSync(migration),true));
test('discovery atomic PostgreSQL saves, target checks, audit and permissions',{skip:available?false:'PostgreSQL binaries and non-root user required'},async t=>{
 const directory=mkdtempSync(join(tmpdir(),'discovery-pg-')),data=join(directory,'data');
 const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',directory,'-p','55494','-U','discovery_test','-d','postgres'];
 const sql=source=>execFileSync('psql',args,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const json=source=>JSON.parse(sql(source));let started=false;
 try{
  execFileSync('initdb',['-D',data,'-U','discovery_test','-A','trust','--no-locale','--encoding=UTF8'],{stdio:'pipe'});
  execFileSync('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-F -k ${directory} -p 55494 -c listen_addresses=''`,'-w','start'],{stdio:'pipe'});started=true;
  sql(`create role anon;create role authenticated;create role service_role bypassrls;create role stranger;alter default privileges in schema public grant all on tables to service_role;alter default privileges in schema public grant execute on functions to service_role;
  create table public.workspaces(id uuid primary key);insert into public.workspaces values('${W}'),('${O}');
  create table public.tasks(id uuid primary key,workspace_id uuid,title text);
  create table public.projects(id uuid primary key,workspace_id uuid,name text);
  create table public.leads(id uuid primary key,workspace_id uuid,name text);
  create table public.deals(id uuid primary key,workspace_id uuid,title text);
  insert into public.projects values('${uuid(100)}','${W}','파일럿'),('${uuid(101)}','${O}','외부');
  insert into public.tasks values('${uuid(102)}','${W}','인터뷰');`);
  const source=readFileSync(migration,'utf8');sql(source);
  await t.test('create, edit and old replay retain latest revision and original observations',()=>{
   assert.equal(json(save()).record.revision,1);
   assert.equal(json(save({expectedRevision:1,requestId:uuid(11),findings:'관심 있음'})).record.revision,2);
   const replay=json(save());assert.equal(replay.status,'duplicate');assert.equal(replay.record.revision,2);assert.equal(replay.record.snapshot.findings,'관심 있음');
   assert.equal(sql('select count(*) from public.discovery_revisions;'),'2');
   assert.equal(sql("select snapshot->>'findings' from public.discovery_revisions where revision=1;"),'');
  });
  await t.test('stale edits, reused keys and cross workspace ids cannot overwrite',()=>{
   for(const patch of [{requestId:uuid(12),expectedRevision:1},{title:'다른 요청'}]) assert.equal(json(save(patch)).status,'conflict');
   assert.equal(json(save({requestId:uuid(13),expectedRevision:2},O)).record,null);
   assert.equal(sql('select count(*) from public.discovery_records;'),'1');
  });
  await t.test('connected requires an existing same workspace execution target',()=>{
   for(const links of [[],[{type:'task',id:uuid(102)}],[{type:'project',id:uuid(101)}],[{type:'project',id:uuid(999)}]]) assert.equal(json(save({requestId:uuid(14),expectedRevision:2,status:'connected',links})).status,'invalid-input');
   const result=json(save({requestId:uuid(14),expectedRevision:2,status:'connected',links:[{type:'project',id:uuid(100)}]}));
   assert.equal(result.status,'saved');assert.equal(result.record.snapshot.links[0].title,'파일럿');
  });
  await t.test('malformed direct RPC snapshots fail without mutations',()=>{
   for(const patch of [{title:'\t\n'},{evidence:'x'.repeat(4001)},{status:'paused'},{status:'closed'},{reviewDate:'2026-02-30'},{expectedRevision:null},{links:[{type:'lead',id:'not-uuid'}]},{links:[{type:'task',id:uuid(102)},{type:'task',id:uuid(102)}]}]) assert.equal(json(save({requestId:uuid(15),expectedRevision:3,...patch})).status,'invalid-input');
   assert.equal(sql('select count(*) from public.discovery_revisions;'),'3');
  });
  await t.test('concurrent creates and edits serialize and replay one receipt',async()=>{
   const run=async s=>JSON.parse((await promisify(execFile)('psql',[...args,'-c',s])).stdout.trim());
   const created=await Promise.all([run(save({id:uuid(2),requestId:uuid(20)})),run(save({id:uuid(2),requestId:uuid(21)}))]);
   assert.deepEqual(created.map(v=>v.status).sort(),['conflict','saved']);
   const edits=await Promise.all([run(save({id:uuid(2),expectedRevision:1,requestId:uuid(22),findings:'A'})),run(save({id:uuid(2),expectedRevision:1,requestId:uuid(23),findings:'B'}))]);
   assert.deepEqual(edits.map(v=>v.status).sort(),['conflict','saved']);
   const replay=await Promise.all([1,2,3].map(()=>run(save({id:null,requestId:uuid(24)}))));
   assert.deepEqual(replay.map(v=>v.status).sort(),['duplicate','duplicate','saved']);
  });
  await t.test('receipt failure rolls back record and observation history',()=>{
   sql(`create function public.fail_receipt() returns trigger language plpgsql as $$ begin raise exception 'test';end $$;create trigger fail before insert on public.discovery_receipts for each row execute function public.fail_receipt();`);
   assert.throws(()=>sql(save({expectedRevision:3,requestId:uuid(30),findings:'must rollback'})));
   sql('drop trigger fail on public.discovery_receipts;');
   assert.equal(sql(`select revision from public.discovery_records where id='${uuid(1)}';`),'3');
   assert.equal(sql(`select count(*) from public.discovery_revisions where record_id='${uuid(1)}';`),'3');
  });
  await t.test('blank and null target labels normalize after verifying actual row existence',()=>{
   sql(`insert into public.projects values('${uuid(110)}','${W}',E' \t\n ');insert into public.tasks values('${uuid(111)}','${W}',E' \r\n ');insert into public.leads values('${uuid(112)}','${W}',null);insert into public.deals values('${uuid(113)}','${W}','   ');`);
   const links=[{type:'project',id:uuid(110)},{type:'task',id:uuid(111)},{type:'lead',id:uuid(112)},{type:'deal',id:uuid(113)}];
   const result=json(save({id:uuid(4),requestId:uuid(40),status:'connected',links}));
   assert.equal(result.status,'saved');assert.equal(result.record.snapshot.links.length,4);
   for(const link of result.record.snapshot.links)assert.equal(link.title,'이름 없음',link.type);
   sql(`update public.projects set name=chr(160)||chr(65279)||chr(12288) where id='${uuid(110)}';`);
   const unicode=json(save({id:uuid(4),expectedRevision:1,requestId:uuid(42),status:'connected',links}));
   assert.equal(unicode.record.snapshot.links.find(link=>link.type==='project').title,'이름 없음');
   assert.equal(json(save({id:uuid(5),requestId:uuid(41),links:[{type:'lead',id:uuid(999)}]})).status,'invalid-input');
  });
  await t.test('service role only, RLS enabled, migration repeatable',()=>{
   for(const role of ['anon','authenticated','stranger']){
    assert.equal(sql(`select has_function_privilege('${role}','public.save_discovery_v1(uuid,jsonb)','EXECUTE');`),'f');
    for(const table of ['discovery_records','discovery_revisions','discovery_receipts']) assert.equal(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE');`),'f');
    assert.throws(()=>sql(`set role ${role};${save()}`));
   }
   for(const table of ['discovery_records','discovery_revisions','discovery_receipts']) {
    assert.equal(sql(`select has_table_privilege('service_role','public.${table}','INSERT,UPDATE,DELETE');`),'f',table);
    assert.throws(()=>sql(`set role service_role;delete from public.${table};`));
   }
   assert.equal(sql("select bool_and(relrowsecurity) from pg_class where relname in ('discovery_records','discovery_revisions','discovery_receipts');"),'t');
   assert.equal(json(`set role service_role;${save()}`).status,'duplicate');
   sql(source);assert.equal(json(save()).record.revision,3);
  });
 }finally{if(started)execFileSync('pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'pipe'});rmSync(directory,{recursive:true,force:true});}
});
