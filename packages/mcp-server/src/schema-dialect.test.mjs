// Guard: MCP clients that validate structured results with a JSON Schema 2020-12
// validator (Claude Code from 2026-09-25) reject any tool whose outputSchema is
// declared in another dialect. The bundled SDK (1.29/1.30) converts zod schemas
// with a draft-07 `$schema`, so the Moonlight server must not declare an
// outputSchema at all — structuredContent still travels without one.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {registerMoonlightTools} from './tools.js';

async function listTools(options){
  const server=new McpServer({name:'dialect-test',version:'0'});
  registerMoonlightTools(server,options);
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client=new Client({name:'dialect-test-client',version:'0'});
  await client.connect(clientTransport);
  try{return (await client.listTools()).tools;}
  finally{await client.close();await server.close();}
}

for(const mode of ['agent','legacy']){
  test(`no tool advertises a draft-07 outputSchema (mode=${mode}, profile=all)`,async()=>{
    const tools=await listTools({profile:'all',mode});
    assert.ok(tools.length>20,`expected the full catalog, got ${tools.length}`);
    for(const tool of tools){
      const dialect=tool.outputSchema?.$schema;
      assert.ok(!dialect||!/draft-0?7/.test(dialect),`${tool.name} declares outputSchema dialect ${dialect}`);
      assert.equal(tool.outputSchema,undefined,`${tool.name} should not declare an outputSchema (SDK emits draft-07)`);
    }
  });
}

test('core profile keeps the local skill tools and their annotations without an outputSchema',async()=>{
  const tools=await listTools({profile:'core',mode:'agent'});
  const names=tools.map(tool=>tool.name);
  assert.ok(names.includes('get_skill_request')&&names.includes('record_skill_receipt'),names.join(','));
  const receipt=tools.find(tool=>tool.name==='record_skill_receipt');
  assert.equal(receipt.annotations?.readOnlyHint,false);
  assert.equal(receipt.outputSchema,undefined);
  assert.equal(typeof receipt.inputSchema,'object');
});
