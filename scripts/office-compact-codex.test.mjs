import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as existing from './eval-office-codex-async.mjs';
import {OFFICE_COMPACT_CODEX_EXECUTION} from './eval-office-compact-codex.mjs';

test('compact evaluation propagates the 48-second budget and authoring policy to the real core boundary',async t=>{
  const budgets=[],controller=new AbortController();
  t.mock.method(AbortSignal,'timeout',ms=>{budgets.push(ms);return controller.signal;});
  const execution={...existing.OFFICE_CODEX_EVALUATION_EXECUTION,jobBudgetMs:48_000,authoring:'compact-v1'};
  const generate=async()=>{},onDiagnostic=()=>{};
  const run=existing.createOfficeCoreEvaluation(async(request,context,input)=>{
    assert.equal(input.authoring,'compact-v1');
    assert.equal(input.signal,controller.signal);
    assert.equal(input.generate,generate);
    assert.equal(input.onDiagnostic,onDiagnostic);
    return {status:'generated'};
  },undefined,execution);
  const result=await run({}, {}, generate,onDiagnostic);
  assert.deepEqual(budgets,[48_000]);
  assert.equal(result.evaluationExecution.authoring,'compact-v1');
  assert.equal(result.evaluationExecution.httpEndpointInvoked,false);
});

test('compact entry lists scenarios even when no CLI executable can be found',async()=>{
  assert.equal(typeof existing.runOfficeCodexEvaluation,'function');
  const {stdout}=await promisify(execFile)(process.execPath,['--import','./scripts/register-hub-alias.mjs','scripts/eval-office-compact-codex.mjs','--only','eevee-work'],{cwd:new URL('../',import.meta.url),env:{...process.env,PATH:''},timeout:5000});
  assert.match(stdout,/1 Office generation calls planned\. No model calls/);
});

test('compact execution binds both journals to its policy and source snapshot and rejects mixed-policy resume',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'office-compact-journal-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const script=join(directory,'offline-protocol.mjs');
  // This subprocess emits a fixed protocol response; it has no model or network.
  await writeFile(script,`
    const args=process.argv.slice(2);
    if(args.includes('--version')){console.log('codex-cli 0.154.0');process.exit(0);}
    if(args.includes('--help')){console.log('--ignore-user-config --ephemeral --sandbox --skip-git-repo-check --cd --config --output-schema --json --model');process.exit(0);}
    for await(const chunk of process.stdin){}
    const emit=value=>console.log(JSON.stringify(value));
    emit({type:'turn.started'});
    emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({answer:'오프라인 계약 검증 응답입니다.',nextAction:'추가 행동 없음.',sourceIndexes:[],corrections:[]})}});
    emit({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});
  `);
  const values={live:true,model:'gpt-5.6-luna',only:['eevee-work'],output:join(directory,'run.jsonl'),'provider-output':join(directory,'provider.jsonl'),'dataset-status':'development'};
  const options={execution:OFFICE_COMPACT_CODEX_EXECUTION,command:process.execPath,argv:[script],extraSourcePaths:['scripts/eval-office-compact-codex.mjs']};
  await existing.runOfficeCodexEvaluation(values,options);
  const entries=async path=>(await readFile(path,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const run=await entries(values.output),provider=await entries(values['provider-output']);
  const header=run[0],record=run.find(entry=>entry.type==='result').record;
  assert.equal(record.response.status,'generated');
  assert.equal(header.provenance.modelConfiguration.model,values.model);
  assert.equal(header.provenance.modelConfiguration.adapter.modelRequested,values.model);
  assert.equal(record.response.generation.modelCalls,1);
  assert.deepEqual(record.response.evaluationExecution,OFFICE_COMPACT_CODEX_EXECUTION);
  assert.equal(provider[0].runId,header.runId);
  assert.equal(provider[0].bundleHash,header.provenance.bundleHash);
  assert.deepEqual(provider[0].execution,header.provenance.modelConfiguration.execution);
  assert.equal(run.at(-1).coverage.runtimeIntegrity,'verified');
  for(const path of ['apps/engine/lib/office/authoring.ts','scripts/eval-office-compact-codex.mjs']){
    assert.equal(header.provenance.sources[path],createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex'));
  }
  assert.equal(provider.filter(entry=>entry.type==='provider-attempt').length,1);
  assert.equal(provider.filter(entry=>entry.type==='provider-result').length,1);
  await assert.rejects(existing.runOfficeCodexEvaluation({...values,resume:true},{...options,execution:existing.OFFICE_CODEX_EVALUATION_EXECUTION}),/Provider journal runtime changed/);
  await assert.rejects(existing.runOfficeCodexEvaluation({...values,resume:true,model:'gpt-5.6-sol'},options),/Provider journal runtime changed/);
  assert.deepEqual(await entries(values['provider-output']),provider);
});
