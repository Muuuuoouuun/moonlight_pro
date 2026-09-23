import assert from 'node:assert/strict';
import {execFileSync,spawnSync,execFile} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';
const available = process.getuid?.() !== 0 && ['initdb','pg_ctl','psql'].every(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
const workspace='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const id = n => `33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const command = (n,action,input,expectedRevision) => ({commandId:id(n),action,input,...(expectedRevision===undefined?{}:{expectedRevision})});
const migrationSource = name => readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8');
test('operating goals PostgreSQL contract and security', {skip:available?false:'PostgreSQL binaries and non-root user required'},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'operating-goals-pg-')),data=join(dir,'data');
  // Unix socket only, in a private directory; a random port keeps parallel clusters apart.
  const port=String(20000+Math.floor(Math.random()*40000));
  const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p',port,'-U','goals_test','-d','postgres'];
  const sql=source=>execFileSync('psql',args,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const request=(cmd,scope=workspace)=>`select public.operating_goal_command_v1('${scope}','operator',${quote(JSON.stringify(cmd))}::jsonb);`;
  const run=(cmd,scope)=>JSON.parse(sql(request(cmd,scope)));
  let started=false,objective,metric;
  try {
    const env={...process.env,LC_ALL:process.env.LC_ALL||'C'};
    execFileSync('initdb',['-D',data,'-U','goals_test','-A','trust','--no-locale','--encoding=UTF8'],{stdio:'pipe',env});
    execFileSync('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-F -k ${dir} -p ${port} -c listen_addresses=''`,'-w','start'],{stdio:'pipe',env});started=true;
    sql(`create role anon;create role authenticated;create role service_role bypassrls;create role unrelated;
      create table workspaces(id uuid primary key);insert into workspaces values('${workspace}'),('${other}');
      create table projects(id uuid primary key,workspace_id uuid not null,meta jsonb default '{}');insert into projects(id,workspace_id,meta) values('${id(90)}','${workspace}','{}'),('${id(91)}','${other}','{}'),('${id(92)}','${workspace}','{"org_scope":"company"}');
      create table brands(id uuid primary key,workspace_id uuid not null,slug text,meta jsonb default '{}');
      create table leads(id uuid primary key,workspace_id uuid not null,company_id uuid,brand_id uuid,meta jsonb default '{}');
      create table deals(like leads including all);create table customer_accounts(like leads including all);`);
    // Mirror Supabase: pgcrypto lives in schema "extensions", so public.digest does not exist.
    sql(`create schema extensions;create extension pgcrypto schema extensions;`);
    const migration=migrationSource('20260921_0036_operating_goals.sql');
    const hashFix=migrationSource('20260922_0039_operating_goal_hash_fix.sql');
    sql(migration);
    await t.test('0036 alone cannot write on Supabase pgcrypto placement; 0039 restores writes',()=>{
      assert.equal(sql(`select to_regprocedure('public.digest(text,text)') is null and to_regprocedure('extensions.digest(text,text)') is not null`),'t');
      const probe=command(99,'create_objective',{title:'해시 확인',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul'});
      assert.throws(()=>run(probe),/digest\(text, unknown\) does not exist/);
      assert.equal(sql('select count(*) from operating_objectives'),'0');
      sql(hashFix);
      assert.equal(sql(`select prosrc like '%sha256(convert_to(%' and prosrc not like '%digest(%' and prosecdef from pg_proc where oid='public.operating_goal_command_v1(uuid,text,jsonb)'::regprocedure`),'t');
      assert.equal(sql(`select array_to_string(proconfig,',') from pg_proc where oid='public.operating_goal_command_v1(uuid,text,jsonb)'::regprocedure`),'search_path=pg_catalog, public, pg_temp');
    });
    await t.test('CRM source scope follows canonical account kind, workspace and brand precedence',()=>{
      let next=100;
      const resolve=(type,meta={},companyId=null,brandId=null)=>{
        const entityId=id(next++);
        sql(`insert into ${type}(id,workspace_id,meta,company_id,brand_id) values('${entityId}','${workspace}',${quote(JSON.stringify(meta))}::jsonb,${companyId?quote(companyId):'null'},${brandId?quote(brandId):'null'});`);
        return sql(`select coalesce(operating_goal_entity_scope_v1('${workspace}','${type}','${entityId}'),'unresolved')`);
      };
      for(const type of ['leads','deals','customer_accounts']){
        assert.equal(resolve(type,{account_kind:'individual'},id(900)),'personal');
        assert.equal(resolve(type,{type:'personal'},id(900)),'personal');
        assert.equal(resolve(type,{kind:'business'}),'company');
        assert.equal(resolve(type,{},id(900)),'company');
        assert.equal(resolve(type,{workspace:'personal',account_kind:'business'},id(900)),'personal');
        assert.equal(resolve(type,{workspace:'business',account_kind:'individual'}),'company');
        assert.equal(resolve(type,{lane:'classin_sales',account_kind:'individual'}),'company');
        assert.equal(resolve(type,{account_kind:'classin'}),'company');
        assert.equal(resolve(type,{account_kind:'brand'},id(900)),'personal');
        assert.equal(resolve(type,{account_kind:'individual',brand_key:'classmoon'},id(900)),'personal');
        assert.equal(resolve(type,{brand_key:'classmoon'}),'company');
        assert.equal(resolve(type,{brandKey:'moonlight'},id(900)),'personal');
        assert.equal(resolve(type,{},id(900),id(999)),'unresolved');
      }
      sql(`alter table projects add column company_id uuid;update projects set company_id='${id(900)}' where id='${id(90)}';`);
      assert.equal(sql(`select operating_goal_entity_scope_v1('${workspace}','projects','${id(90)}')`),'personal');
    });
    const create=command(1,'create_objective',{title:'실제 결과 측정',scope:'personal',periodStart:'2026-09-01',periodEnd:'2026-09-30',timezone:'Asia/Seoul'});
    await t.test('create and repeated command produce one objective and receipt',()=>{
      const saved=run(create);assert.equal(saved.status,'saved');assert.equal(saved.persisted,true);assert.equal(saved.replayed,false);objective=saved.entity;
      assert.equal(objective.periodStart,'2026-09-01');assert.equal(objective.revision,1);
      assert.equal(sql(`select count(*)||':'||bool_and(request_hash~'^[0-9a-f]{64}$')||':'||bool_and(response->>'status'='saved') from operating_goal_receipts where command_id='${id(1)}'`),'1:true:true');
      assert.equal(run(create).replayed,true);assert.equal(sql('select count(*) from operating_objectives'),'1');
      assert.equal(sql('select count(*) from operating_goal_receipts'),'1');
      assert.equal(run({...create,input:{...create.input,title:'다른 제목'}}).status,'conflict');
    });
    await t.test('immutable period and exact CAS preserve objective',async()=>{
      assert.equal(run(command(2,'update_objective',{id:objective.id,periodStart:'2026-08-01'},1)).status,'invalid-input');
      const results=await Promise.all([3,4].map(n=>promisify(execFile)('psql',[...args,'-c',request(command(n,'update_objective',{id:objective.id,title:`수정 ${n}`},1))]).then(r=>JSON.parse(r.stdout))));
      assert.deepEqual(results.map(r=>r.status).sort(),['conflict','saved']);objective=results.find(r=>r.status==='saved').entity;
    });
    await t.test('metrics preserve zero targets and cannot be edited in place',()=>{
      const result=run(command(5,'create_metric',{objectiveId:objective.id,name:'후속 누락',unit:'건',role:'guardrail',direction:'decrease',baseline:4,target:0,sourceKey:'manual'}));
      assert.equal(result.status,'saved');metric=result.entity;assert.equal(metric.target,0);
      assert.throws(()=>sql(`update operating_metrics set target=9 where id='${metric.id}'`));
      assert.equal(run(command(6,'create_metric',{objectiveId:objective.id,name:'불가능',unit:'건',role:'outcome',direction:'increase',baseline:10,target:0,sourceKey:'manual'})).status,'invalid-input');
    });
    await t.test('cross-workspace references fail and links do not create observations',()=>{
      assert.equal(run(command(7,'link_entity',{objectiveId:objective.id,entityType:'projects',entityId:id(91)},objective.revision)).status,'invalid-input');
      assert.equal(run(command(7,'link_entity',{objectiveId:objective.id,entityType:'projects',entityId:id(92)},objective.revision)).error,'entity-scope-mismatch');
      assert.equal(run(command(8,'link_entity',{objectiveId:objective.id,entityType:'projects',entityId:id(90)},objective.revision)).status,'saved');
      assert.equal(sql('select count(*) from operating_goal_links'),'1');assert.equal(sql('select count(*) from operating_observations'),'0');
      assert.equal(run(command(9,'create_metric',{objectiveId:objective.id,name:'다른 범위',unit:'건',role:'driver',direction:'increase',sourceKey:'manual'}),other).status,'invalid-input');
    });
    await t.test('deleted source links can be removed from archived objectives with CAS',()=>{
      sql(`delete from projects where id='${id(90)}'`);
      const archived=run(command(82,'update_objective',{id:objective.id,status:'archived'},objective.revision+1));
      assert.equal(archived.status,'saved');objective=archived.entity;
      const input={objectiveId:objective.id,entityType:'projects',entityId:id(90)};
      assert.equal(run(command(80,'unlink_entity',input,objective.revision-1)).status,'conflict');
      assert.equal(run(command(81,'unlink_entity',input,objective.revision)).status,'saved');
      assert.equal(sql('select count(*) from operating_goal_links'),'0');
      const restored=run(command(83,'update_objective',{id:objective.id,status:'active'},objective.revision+1));
      assert.equal(restored.status,'saved');objective=restored.entity;
    });
    const recordedAt=new Date(Date.now()-60000).toISOString();
    const evidence=[{label:'당일 확인',href:'/dashboard/work',occurredAt:recordedAt}];
    const observation={metricId:null,value:0,observedAt:recordedAt,periodStart:'2026-09-01',periodEnd:'2026-09-30',coverage:'complete',evidence};
    await t.test('manual snapshots append, preserve corrections and require evidence and exact period',()=>{
      observation.metricId=metric.id;
      for(const patch of [{evidence:[]},{sourceKey:'tasks_completed'},{periodStart:'2026-08-01'},{value:null},{observedAt:'2026-08-31T14:59:59Z',evidence:[{...evidence[0],occurredAt:'2026-08-31T14:59:59Z'}]},{observedAt:new Date(Date.now()+86400000).toISOString()},{evidence:[{...evidence[0],occurredAt:new Date().toISOString()}]},{evidence:[{label:'침입',href:'javascript:alert(1)',occurredAt:recordedAt}]}])assert.equal(run(command(10,'record_observation',{...observation,...patch})).status,'invalid-input');
      // +16:00 matches the format regex but exceeds PostgreSQL's ±15:59 offset range (22009):
      // it must come back as the invalid-input envelope, not a raw error (command-outcome-unknown).
      const farOffset='2026-09-21T01:00:00+16:00';
      for(const patch of [{observedAt:farOffset},{evidence:[{...evidence[0],occurredAt:farOffset.replace('+','-')}]}]){
        const rejected=run(command(10,'record_observation',{...observation,...patch}));
        assert.equal(rejected.status,'invalid-input');assert.equal(rejected.persisted,false);
      }
      assert.equal(sql(`select count(*) from operating_goal_receipts where command_id='${id(10)}'`),'0');
      assert.equal(run(command(11,'record_observation',observation)).status,'saved');
      assert.equal(run(command(12,'record_observation',{...observation,value:1})).status,'saved');
      assert.equal(sql('select count(*) from operating_observations'),'2');
      assert.throws(()=>sql('update operating_observations set value=5'));
      assert.throws(()=>sql('delete from operating_observations'));
    });
    await t.test('automatic metrics reject manually supplied measurements',()=>{
      const auto=run(command(13,'create_metric',{objectiveId:objective.id,name:'완료 작업',unit:'건',role:'driver',direction:'increase',sourceKey:'tasks_completed'}));
      assert.equal(run(command(14,'record_observation',{...observation,metricId:auto.entity.id})).status,'invalid-input');
    });
    await t.test('receipt failure rolls back domain change and receipt lookup is isolated',()=>{
      sql(`create function fail_goal_receipt() returns trigger language plpgsql as $$ begin raise exception 'injected'; end; $$;create trigger fail_goal_receipt before insert on operating_goal_receipts for each row execute function fail_goal_receipt();`);
      assert.throws(()=>run(command(15,'record_observation',observation)));
      sql('drop trigger fail_goal_receipt on operating_goal_receipts;');assert.equal(sql('select count(*) from operating_observations'),'2');
      const read=scope=>JSON.parse(sql(`select operating_goal_receipt_v1('${scope}','operator','${id(11)}')`));
      assert.equal(read(workspace).status,'saved');assert.equal(read(other).persisted,null);
    });
    await t.test('RLS and execution privileges fail closed; migration is repeatable',()=>{
      const sig='operating_goal_command_v1(uuid,text,jsonb)';
      for(const role of ['anon','authenticated','unrelated']) {
        assert.equal(sql(`select has_function_privilege('${role}','${sig}','EXECUTE')`),'f');
        assert.equal(sql(`select has_table_privilege('${role}','operating_objectives','SELECT,INSERT,UPDATE,DELETE')`),'f');
      }
      assert.equal(sql(`select has_table_privilege('service_role','operating_observations','UPDATE')`),'f');
      assert.equal(sql(`select bool_and(relrowsecurity) from pg_class where relname like 'operating_%' and relkind='r'`),'t');
      assert.equal(JSON.parse(sql(`set role service_role;${request(create)}`)).replayed,true);
      // Filename order: re-running 0036 restores the digest version until 0039 runs again.
      sql(migration);sql(hashFix);sql(hashFix);assert.equal(sql('select count(*) from operating_observations'),'2');
      assert.equal(run(create).replayed,true);
      for(const role of ['anon','authenticated','unrelated'])assert.equal(sql(`select has_function_privilege('${role}','${sig}','EXECUTE')`),'f');
      assert.equal(sql(`select has_function_privilege('service_role','${sig}','EXECUTE')`),'t');
    });
  } finally {
    if(started)execFileSync('pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'pipe',env:{...process.env,LC_ALL:process.env.LC_ALL||'C'}});
    rmSync(dir,{recursive:true,force:true});
  }
});
