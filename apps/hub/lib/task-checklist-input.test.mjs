import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistEnterAction, checklistForSave } from './task-checklist-input.js';
const row = (n, extra = {}) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: String(n), note: '', done: false, ...extra });
test('Enter inserts after current row, reuses an adjacent empty row', () => {
  const items = [row(1), row(2)];
  assert.deepEqual(checklistEnterAction(items, items[0].id, { key: 'Enter' }), { insertAt: 1 });
  const blank = row(3, { title: '' });
  assert.deepEqual(checklistEnterAction([items[0], blank, items[1]], items[0].id, { key: 'Enter' }), { focusId: blank.id });
});
test('IME, shortcuts, empty title, limit and disabled inputs never create rows', () => {
  for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', metaKey: true }, { key: 'Enter', ctrlKey: true }, { key: 'Enter', shiftKey: true }, { key: 'Tab' }]) {
    assert.equal(checklistEnterAction([row(1)], row(1).id, event), null);
  }
  assert.equal(checklistEnterAction([row(1, { title: ' ' })], row(1).id, { key: 'Enter' }), null);
  assert.equal(checklistEnterAction([row(1)], row(1).id, { key: 'Enter' }, true), null);
  assert.equal(checklistEnterAction(Array.from({ length: 50 }, (_, i) => row(i)), row(1).id, { key: 'Enter' }), null);
});
test('save drops only completely unused rows and keeps notes or checked blank rows for validation', () => {
  const items = [row(1), row(2, { title: ' ' }), row(3, { title: '', note: '완료 기준' }), row(4, { title: '', done: true })];
  assert.deepEqual(checklistForSave(items), [items[0], items[2], items[3]]);
  assert.equal(items.length, 4);
});
