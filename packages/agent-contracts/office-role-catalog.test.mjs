import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROSTER } from './office.js';

async function catalog() {
  return import('@com-moon/agent-contracts/office-role-catalog').catch(error => {
    assert.fail(`The shared, browser-safe Office role catalog must be exported: ${error.code}`);
  });
}

test('the versioned catalog covers exactly the existing nine identities once', async () => {
  const { OFFICE_ROLE_CATALOG, OFFICE_ROLE_CATALOG_VERSION } = await catalog();
  const ids = Object.keys(OFFICE_ROLE_CATALOG);
  assert.equal(OFFICE_ROLE_CATALOG_VERSION, '2026-09-29.v1');
  assert.equal(ids.length, 9);
  assert.equal(new Set(Object.values(OFFICE_ROLE_CATALOG).map(role => role.id)).size, 9);
  assert.deepEqual(ids, OFFICE_ROSTER.map(role => role.id));
  for (const identity of OFFICE_ROSTER) {
    const role = OFFICE_ROLE_CATALOG[identity.id];
    assert.deepEqual({ id: role.id, name: role.name, role: role.role }, {
      id: identity.id, name: identity.name, role: identity.role,
    });
    assert.ok(role.responsibility.trim().length > 0 && role.responsibility.length <= 160);
    assert.ok(role.handoff.trim().length > 0 && role.handoff.length <= 240);
    assert.ok(role.starters.length >= 2 && role.starters.length <= 3);
    assert.ok(role.starters.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160));
    assert.ok(Object.isFrozen(role) && Object.isFrozen(role.starters));
  }
  assert.ok(Object.isFrozen(OFFICE_ROLE_CATALOG));
});

test('notice owners use real source responsibility and retain the actual reply owner', async () => {
  const { OFFICE_NOTICE_OWNERS, officeNoticeOwner } = await catalog();
  assert.deepEqual(OFFICE_NOTICE_OWNERS, { inquiry: 'flareon', calendar: 'vaporeon' });
  assert.equal(officeNoticeOwner('inquiry', 'eevee'), 'flareon');
  assert.equal(officeNoticeOwner('calendar', 'eevee'), 'vaporeon');
  for (const { id } of OFFICE_ROSTER) assert.equal(officeNoticeOwner('agentReply', id), id);
  for (const id of [undefined, null, '', 'unknown', 'toString', '__proto__']) {
    assert.equal(officeNoticeOwner('agentReply', id), null);
  }
  for (const kind of ['unknown', '__proto__', 'toString']) {
    assert.equal(officeNoticeOwner(kind, 'eevee'), null);
  }
});
