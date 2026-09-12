import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inquiryReadState, inquirySeenSequence, inquirySaved, safeInquiryUrl } from './inquiry-view-state.js';
import { inquiryScopeForWorkspace } from './workspace-map.js';

test('read failures and preview never become zero unread', () => {
  assert.equal(inquiryReadState({ status: 'error', rows: [], unreadCount: 0 }).unreadCount, null);
  assert.equal(inquiryReadState({ status: 'preview', rows: [] }).unreadCount, null);
  assert.equal(inquiryReadState({ status: 'live', rows: [], unreadCount: 109 }).unreadCount, 109);
});
test('only rendered inbound evidence can be marked read, not a concurrently newer parent', () => {
  assert.equal(inquirySeenSequence({ status: 'live', inquiry: { last_inbound_seq: 8 }, events: [{ inbound_seq: 6 }, { inbound_seq: 7 }] }), 7);
  assert.equal(inquirySeenSequence({ status: 'error', inquiry: { last_inbound_seq: 8 }, events: [] }), null);
});
test('preview or conflict never counts as a saved mutation', () => {
  assert.equal(inquirySaved({ status: 'preview' }), false);
  assert.equal(inquirySaved({ status: 'conflict' }), false);
  assert.equal(inquirySaved({ status: 'saved' }), true);
});
test('untrusted source URLs remain text unless HTTP(S)', () => {
  assert.equal(safeInquiryUrl('javascript:alert(1)'), null);
  assert.equal(safeInquiryUrl('https://mail.google.com/mail/u/0/#all/123'), 'https://mail.google.com/mail/u/0/#all/123');
});
test('inquiry scope keeps unclassified separate from personal', () => {
  assert.equal(inquiryScopeForWorkspace('personal'), 'personal');
  assert.equal(inquiryScopeForWorkspace('unclassified'), 'unclassified');
  assert.equal(inquiryScopeForWorkspace(undefined), 'all');
});
