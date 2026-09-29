import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';

test('each Office agent has a compact local portrait', async () => {
  for (const { id } of OFFICE_ROSTER) {
    const file = new URL(`../../public/office/avatars/${id}.jpg`, import.meta.url);
    const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
    assert.ok(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), `${id} must be a JPEG`);
    assert.ok(info.size < 120_000, `${id} exceeds the Office portrait budget`);
  }
});
