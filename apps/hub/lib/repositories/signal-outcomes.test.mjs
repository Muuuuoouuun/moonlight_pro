import assert from 'node:assert/strict';
import { test } from 'node:test';

import { finishedTodayFrom, scheduledBlocksFrom } from './signal-outcomes.js';

// 확인할 것 영수증(2026-09-30 스펙 §4.5·§4.7) — 잡아 둔 일은 끝냄으로 세지 않고 레일에 따로 싣는다.
const TODAY = '2026-10-01';
const NOW = Date.parse('2026-10-01T04:00:00Z'); // 13:00 KST
const row = (overrides) => ({ id: overrides.id, signal_key: 'work-blocked:p1', subject_type: 'project', subject_id: 'p1', title: '프로젝트 C', undone_at: null, ...overrides });

test('잡아 둔 일은 오늘 끝낸 것에 들어가지 않는다', () => {
  const rows = [
    row({ id: 'a', outcome: 'scheduled', scheduled_start: '2026-10-01T06:00:00Z', scheduled_end: '2026-10-01T06:30:00Z', created_at: '2026-10-01T01:00:00Z' }),
    row({ id: 'b', signal_key: 'revenue-stale:d1', outcome: 'contact_logged', created_at: '2026-10-01T02:00:00Z' }),
  ];
  assert.deepEqual(finishedTodayFrom(rows, TODAY).map((receipt) => receipt.id), ['b']);
});

test('레일 블록: 다시 잡았으면 최근 것만, 되돌린 것·어제 것은 빼고, 상태와 끝냄 표시를 단다', () => {
  const rows = [
    // 같은 항목을 지난 시간에 잡았다가 다시 잡음 — 최근 것만 남는다.
    row({ id: 'old', outcome: 'scheduled', scheduled_start: '2026-10-01T01:00:00Z', scheduled_end: '2026-10-01T01:15:00Z', created_at: '2026-09-30T23:00:00Z' }),
    row({ id: 'new', outcome: 'scheduled', scheduled_start: '2026-10-01T06:00:00Z', scheduled_end: '2026-10-01T06:30:00Z', created_at: '2026-10-01T02:00:00Z' }),
    // 지금 진행 중인 블록 — 잡은 뒤 연락 기록이 남아 끝냄.
    row({ id: 'live', signal_key: 'revenue-stale:d1', subject_type: 'deal', subject_id: 'd1', outcome: 'scheduled', scheduled_start: '2026-10-01T03:50:00Z', scheduled_end: '2026-10-01T04:10:00Z', created_at: '2026-10-01T01:00:00Z' }),
    row({ id: 'logged', signal_key: 'revenue-stale:d1', outcome: 'contact_logged', created_at: '2026-10-01T04:01:00Z' }),
    // 되돌린 블록과 어제 블록은 빠진다.
    row({ id: 'undone', signal_key: 'content:c1', outcome: 'scheduled', scheduled_start: '2026-10-01T07:00:00Z', scheduled_end: '2026-10-01T07:45:00Z', created_at: '2026-10-01T01:00:00Z', undone_at: '2026-10-01T02:00:00Z' }),
    row({ id: 'yesterday', signal_key: 'risk:r1', outcome: 'scheduled', scheduled_start: '2026-09-30T06:00:00Z', scheduled_end: '2026-09-30T06:15:00Z', created_at: '2026-09-30T01:00:00Z' }),
  ];
  const blocks = scheduledBlocksFrom(rows, { todayKey: TODAY, now: NOW });
  assert.deepEqual(blocks.map((block) => [block.id, block.state, block.done]), [
    ['live', 'now', true],
    ['new', 'waiting', false],
  ]);
  assert.equal(blocks[1].title, '프로젝트 C');
  assert.deepEqual(blocks[1].subject, { type: 'project', id: 'p1' });
});
