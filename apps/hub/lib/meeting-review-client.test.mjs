import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeetingTaskCommand, meetingReviewWriteSucceeded, meetingTaskWriteSucceeded, readMeetingReviewEnvelope } from './meeting-review-client.js';

const entryId = '11111111-1111-4111-8111-111111111111';
const proposalId = '22222222-2222-4222-8222-222222222222';
const entry = { id: entryId, revision: 3, body: '가격은 미정입니다. 금요일에 다시 연락하겠습니다.' };
const start = entry.body.indexOf('금요일에');
const quote = '금요일에 다시 연락하겠습니다.';
const stepId = '44444444-4444-4444-8444-444444444444';
const execution = { actionScope: 'mine', dueAt: '2026-09-30', method: '전화로 확인',
  checklist: [{ id: stepId, title: '고객에게 전화', done: false, note: '' }] };
const proposal = { id: proposalId, kind: 'action', source: { start, end: start + quote.length, quote }, review: { status: 'accepted', text: '금요일에 고객에게 다시 연락', execution } };

test('task command is tied to exact source, revision and stable proposal request ID', () => {
  const command = buildMeetingTaskCommand(entry, proposal);
  assert.equal(command.requestId, proposalId);
  assert.equal(command.expectedRevision, 3);
  assert.equal(command.selection.prefix + command.selection.text + command.selection.suffix, entry.body);
  assert.equal(command.selection.text, quote);
  assert.deepEqual(command.target, { title: proposal.review.text, dueAt: '2026-09-30T00:00:00+09:00',
    projectId: null, nextAction: '전화로 확인', checklist: execution.checklist });
});

test('unreviewed, fabricated, oversized or already applied proposals cannot create tasks', () => {
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, review: { status: 'pending', text: proposal.review.text } }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, source: { ...proposal.source, quote: '없는 발언' } }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, review: { status: 'accepted', text: '가'.repeat(201) } }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, application: { status: 'saved' } }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, kind: 'signal' }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, review: { ...proposal.review, execution: { ...execution, actionScope: 'related' } } }), null);
  assert.equal(buildMeetingTaskCommand(entry, { ...proposal, review: { ...proposal.review, execution: { ...execution, checklist: [{ ...execution.checklist[0], done: true }] } } }), null);
});

test('read and write envelopes never promote preview or HTTP 200 error to success', () => {
  assert.equal(readMeetingReviewEnvelope({ ok: true }, { status: 'live', proposals: [] }).status, 'live');
  assert.equal(readMeetingReviewEnvelope({ ok: true }, { status: 'error', proposals: [] }).status, 'error');
  assert.equal(readMeetingReviewEnvelope({ ok: true }, { status: 'preview', proposals: [{ id: proposalId }] }).proposals.length, 0);
  assert.equal(meetingReviewWriteSucceeded({ ok: true }, { status: 'saved' }), true);
  assert.equal(meetingReviewWriteSucceeded({ ok: true }, { status: 'preview' }), false);
  assert.equal(meetingReviewWriteSucceeded({ ok: true }, { status: 'error' }), false);
  assert.equal(meetingReviewWriteSucceeded({ ok: false }, { status: 'saved' }), false);
});

test('task receipt must match the requested note, source revision and linked task', () => {
  const command = buildMeetingTaskCommand(entry, proposal);
  const taskId = '33333333-3333-4333-8333-333333333333';
  const receipt = { status: 'saved', entry: { id: entryId }, target: { type: 'task', id: taskId, href: `/dashboard/work/my?task=${taskId}` },
    link: { targetType: 'task', targetId: taskId, sourceRevision: entry.revision, excerpt: quote } };
  assert.equal(meetingTaskWriteSucceeded({ ok: true }, receipt, command), true);
  assert.equal(meetingTaskWriteSucceeded({ ok: true }, { ...receipt, status: 'preview' }, command), false);
  assert.equal(meetingTaskWriteSucceeded({ ok: true }, { ...receipt, link: { ...receipt.link, excerpt: '다른 원문' } }, command), false);
  assert.equal(meetingTaskWriteSucceeded({ ok: true }, { ...receipt, target: { ...receipt.target, id: proposalId } }, command), false);
});
