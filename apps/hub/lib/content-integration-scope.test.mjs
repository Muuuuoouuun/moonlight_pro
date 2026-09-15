import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterContentByWorkspace } from '../components/hub/workspace-map.js';

test('unbranded captures stay visible only in their explicit personal/company scope', () => {
  const rows = [{ id: 'personal', orgScope: 'personal' }, { id: 'company', orgScope: 'company' }, { id: 'legacy-company', orgScope: 'classin' }];
  assert.deepEqual(filterContentByWorkspace(rows, 'classin').map(row => row.id), ['company', 'legacy-company']);
  assert.deepEqual(filterContentByWorkspace(rows, 'brand').map(row => row.id), ['personal']);
  assert.deepEqual(filterContentByWorkspace(rows, 'all'), rows);
});
