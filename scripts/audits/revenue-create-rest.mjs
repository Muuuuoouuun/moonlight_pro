import assert from 'node:assert/strict';
export const workspace = '00000000-0000-4000-8000-000000000001';
export const createId = '00000000-0000-4000-8000-000000000002';
export function fixture(t, table, { loseFirst = false, malformedFirst = false, initialRows = [], blockRead = false, rejectFirst = null, holdFirst = false } = {}) {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','COM_MOON_DEFAULT_WORKSPACE_ID'];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.SUPABASE_URL = 'https://synthetic.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-not-a-secret'; process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  const rows = new Map(initialRows.map(r => [r.id, structuredClone(r)])), calls = [];
  let ordinal = 0, postCount = 0, releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const response = (body, status = 200) => ({ ok: status < 400, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: () => null } });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || 'GET';
    assert.equal(url.origin, 'https://synthetic.invalid'); assert.equal(url.pathname, `/rest/v1/${table}`);
    calls.push({ method, url: url.href, body: init.body ? JSON.parse(init.body) : null });
    if (method === 'GET') {
      assert.equal(url.searchParams.get('id'), `eq.${createId}`); assert.equal(url.searchParams.get('workspace_id'), `eq.${workspace}`);
      if (blockRead) return response({ message: 'synthetic read unavailable' }, 503);
      return response([...rows.values()].filter(r => `eq.${r.id}` === url.searchParams.get('id') && `eq.${r.workspace_id}` === url.searchParams.get('workspace_id')));
    }
    assert.equal(method, 'POST', 'no hidden UPDATE/DELETE or upsert');
    postCount++; if (holdFirst && postCount === 1) await firstGate;
    if (rejectFirst) { const status = rejectFirst; rejectFirst = null; return response({message:'synthetic rejection'},status); }
    assert.equal(init.headers.Prefer || init.headers.prefer, 'return=representation');
    const body = JSON.parse(init.body), id = body.id || `00000000-0000-4000-8000-${String(++ordinal + 10).padStart(12,'0')}`;
    const required = ['deals','operation_cases'].includes(table) ? 'title' : table === 'customer_accounts' ? 'name' : null;
    if (required && body[required] == null) return response({ code: '23502', message: 'synthetic required column absent' }, 400);
    if (rows.has(id)) return response({ code: '23505', message: 'synthetic duplicate primary key' }, 409);
    const row = { ...(table === 'deals' ? { stage: 'prospect' } : {}), ...body, id }; rows.set(id, row);
    if (loseFirst) { loseFirst = false; throw new TypeError('synthetic response lost AFTER commit'); }
    if (malformedFirst) { malformedFirst = false; return response('not-json', 201); }
    return response([row], 201);
  };
  t.after(() => { releaseFirst(); globalThis.fetch = originalFetch; for (const k of keys) old[k] === undefined ? delete process.env[k] : process.env[k] = old[k]; });
  return { rows, calls, releaseFirst };
}
