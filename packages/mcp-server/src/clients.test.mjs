import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createClient,findClient,readClients,revokeClient} from './clients.js';

const registry=()=>join(mkdtempSync(join(tmpdir(),'moonlight-clients-')),'mcp','clients.json');

test('stores only a digest, in a private file, and shows the token once',()=>{
  const file=registry();
  const {token,client}=createClient(file,{name:'n8n',profile:'sales',readOnly:true});
  assert.match(token,/^mlm_[A-Za-z0-9_-]{43}$/);
  const raw=readFileSync(file,'utf8');
  assert.equal(raw.includes(token),false);
  assert.equal(raw.includes(token.slice(4)),false);
  assert.equal(statSync(file).mode&0o777,0o600);
  assert.equal(statSync(dirname(file)).mode&0o777,0o700);
  assert.deepEqual({...client,tokenSha256:undefined,createdAt:undefined},{name:'n8n',profile:'sales',readOnly:true,allowUrl:false,tokenSha256:undefined,createdAt:undefined});
  assert.equal(findClient(readClients(file),token)?.name,'n8n');
});

test('rejects unknown tokens, duplicate names, bad names and unknown profiles',()=>{
  const file=registry();
  const {token}=createClient(file,{name:'cursor'});
  const clients=readClients(file);
  assert.equal(findClient(clients,`${token}x`),null);
  assert.equal(findClient(clients,''),null);
  assert.equal(findClient(clients,undefined),null);
  assert.throws(()=>createClient(file,{name:'cursor'}),/already exists/);
  assert.throws(()=>createClient(file,{name:'Bad Name'}),/Client name/);
  assert.throws(()=>createClient(file,{name:'ok',profile:'root'}),/Unknown profile/);
  assert.throws(()=>createClient(file,{name:'web',allowUrl:true}),/URL tokens are read-only/);
});

test('revocation removes exactly one client',()=>{
  const file=registry();
  const a=createClient(file,{name:'a'});const b=createClient(file,{name:'b'});
  assert.equal(revokeClient(file,'a'),true);
  assert.equal(revokeClient(file,'a'),false);
  const clients=readClients(file);
  assert.equal(findClient(clients,a.token),null);
  assert.equal(findClient(clients,b.token)?.name,'b');
});
