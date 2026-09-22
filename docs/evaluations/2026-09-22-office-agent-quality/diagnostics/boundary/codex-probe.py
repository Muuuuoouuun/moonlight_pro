import json,os,pathlib,subprocess,time,selectors,signal
prefix=pathlib.Path('/tmp/moonlight-office-codex-probe')
workspace=prefix.with_suffix('.workspace');workspace.mkdir(exist_ok=True)
base=[json.loads(l) for l in pathlib.Path('/tmp/moonlight-office-minimal-ablation.prompts.jsonl').read_text().splitlines()]
schema={'type':'object','additionalProperties':False,'properties':{'answer':{'type':'string'},'nextAction':{'type':'string'}},'required':['answer','nextAction']}
schema_path=prefix.with_suffix('.schema.json');schema_path.write_text(json.dumps(schema,ensure_ascii=False))
cmd=['codex','exec','--ignore-user-config','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--cd',str(workspace),'--config','web_search="disabled"','--output-schema',str(schema_path),'--json','-']
results=[]
for item in [x for x in base if x['variant']=='A']:
 prompt='This is a text-only diagnostic using fictional source material. Do not use tools, read files, browse, execute commands, or modify anything. Answer the provided request using only its source material.\n'+item['systemInstruction']+'\nReturn only the requested JSON.\n\n'+item['prompt']
 start=time.monotonic();proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True,bufsize=1)
 proc.stdin.write(prompt);proc.stdin.close();sel=selectors.DefaultSelector();sel.register(proc.stdout,selectors.EVENT_READ,'stdout');sel.register(proc.stderr,selectors.EVENT_READ,'stderr')
 events=[];final=None;usage=None;error=None;model=None;tool_count=0
 while sel.get_map():
  if time.monotonic()-start>45:
   error='wall-clock-limit';os.killpg(proc.pid,signal.SIGTERM);break
  for key,_ in sel.select(0.1):
   line=key.fileobj.readline()
   if not line:sel.unregister(key.fileobj);continue
   if key.data=='stderr':
    if line.startswith('model:'):model=line.split(':',1)[1].strip()
    continue
   try:event=json.loads(line)
   except json.JSONDecodeError:continue
   typ=event.get('type');entry={'type':typ}
   obj=event.get('item')
   if isinstance(obj,dict):
    entry['itemType']=obj.get('type');entry['status']=obj.get('status')
    if obj.get('type') in ['command_execution','file_change','mcp_tool_call','web_search']:
     tool_count+=1;error='unexpected-tool-use';os.killpg(proc.pid,signal.SIGTERM)
    if typ=='item.completed' and obj.get('type')=='agent_message':final=obj.get('text')
   if typ=='turn.completed':usage=event.get('usage')
   if typ in ['error','turn.failed']:error='cli-turn-failed'
   events.append(entry)
  if error=='unexpected-tool-use':break
 try:code=proc.wait(timeout=3)
 except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);code=proc.wait()
 try:answer=json.loads(final) if final else None
 except json.JSONDecodeError:answer=None;error=error or 'invalid-json'
 result={'id':item['scenarioId'],'transport':'saved-login-codex-cli','modelRequested':'CLI default (user config not loaded)','modelReported':model,'prompt':prompt,'schema':schema,'command':cmd,'elapsedMs':round((time.monotonic()-start)*1000),'exitCode':code,'error':error,'answer':answer,'finalText':final,'usage':usage,'toolCallsObserved':tool_count,'events':events}
 results.append(result);prefix.with_suffix('.results.json').write_text(json.dumps({'kind':'development-diagnostic','retries':0,'deploymentChange':False,'results':results},ensure_ascii=False,indent=2))
 print(json.dumps({k:result[k] for k in ['id','elapsedMs','exitCode','error','answer','toolCallsObserved','modelReported']},ensure_ascii=False),flush=True)
