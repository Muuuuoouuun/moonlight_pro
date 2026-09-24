import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('real MCP client accepts structured Agent results and preserves all schema fields',async t=>{
 const payload={status:'live',source:'fixture',schemaVersion:'1.0',data:{resource:'tasks',rows:[]},page:{returnedCount:0,hasMore:false,nextCursor:null}};
 const server=http.createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer fixture-token');res.setHeader('content-type','application/json');res.end(JSON.stringify(payload));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'contract-test',version:'1.0'},{capabilities:{}});
 t.after(async()=>{await client.close();await new Promise(resolve=>server.close(resolve));});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env:{PATH:process.env.PATH,COM_MOON_AGENT_API_TOKEN:'fixture-token',COM_MOON_HUB_URL:`http://127.0.0.1:${server.address().port}`},stderr:'pipe'}),{timeout:5000});
 const {tools}=await client.listTools();assert.equal(tools.length,10);
 const result=await client.callTool({name:'list_tasks',arguments:{limit:1}});
 assert.deepEqual(result.structuredContent,payload);
});

test('real stdio assistant profile validates source-backed candidate and goal commands', async t => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let text = ''; req.on('data', chunk => text += chunk); req.on('end', () => {
      requests.push({ path: req.url, body: text ? JSON.parse(text) : null });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ status: 'saved', persisted: true }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'assistant-contract', version: '1.0' }, { capabilities: {} });
  t.after(async () => { await client.close(); await new Promise(resolve => server.close(resolve)); });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./index.js', import.meta.url))], env: { PATH: process.env.PATH, COM_MOON_AGENT_API_TOKEN: 'test-token', COM_MOON_HUB_URL: `http://127.0.0.1:${server.address().port}`, COM_MOON_MCP_PROFILE: 'assistant' }, stderr: 'pipe' }), { timeout: 5000 });
  const list = await client.listTools(); assert.equal(list.tools.length, 13);
  const commandId = '11111111-1111-4111-8111-111111111111';
  const result = await client.callTool({ name: 'save_ai_candidate', arguments: { commandId, entityType: 'tasks', entityId: '22222222-2222-4222-8222-222222222222', scope: 'personal', expectedSourceUpdatedAt: '2026-09-21T00:00:00Z', operation: 'draft', output: '근거 기반 후보', client: 'claude' } });
  assert.equal(result.structuredContent.persisted, true); assert.equal(requests[0].body.action, 'save_candidate');
  await client.callTool({ name: 'record_goal_command', arguments: { commandId, action: 'create_objective', input: { title: '목표' } } });
  assert.equal(requests[1].path, '/api/agent/v1/goals/commands');
});
