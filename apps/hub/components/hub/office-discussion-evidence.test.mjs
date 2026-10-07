import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfficeSpeechEvidence, OfficeCollaborationSummary, OfficeObjectionResolutions } from './office-discussion-evidence.jsx';

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('speech details expose mixed source tracking and the exact peer utterance safely', () => {
  const html = render(OfficeSpeechEvidence, { speech: {
    sourceCheck: 'traced', sourceCounts: { selected: 2, traced: 1, untraced: 1 },
    peerReviews: [{ ownerId: 'umbreon', field: 'objection', quote: '<script>근거 없음</script>', assessment: 'needs_evidence', reason: '확인 전 약속에서 제외합니다.' }],
  } });
  assert.match(html, /원문 일치/);
  assert.match(html, /연결 안 됨/);
  assert.match(html, /블래키의 반론에 근거 필요/);
  assert.match(html, /확인 전 약속에서 제외/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('every open objection remains visible even when there are more than five', () => {
  const turns = ['position', 'response'].flatMap(round => ['eevee', 'umbreon', 'leafeon'].map(ownerId => ({ ownerId, round, turnRef: `${round}:${ownerId}`, objection: `${round} ${ownerId}의 미확인 조건` })));
  const discussion = { turns, resolutions: turns.map(turn => ({ turnRef: turn.turnRef, disposition: 'open', rationale: `${turn.turnRef} 확인 필요` })) };
  const html = render(OfficeObjectionResolutions, { discussion });
  for (const turn of turns) assert.ok(html.includes(turn.objection));
  assert.equal(html.match(/남은 쟁점/g).length, 6);
  assert.equal(render(OfficeObjectionResolutions, { discussion: { turns } }), '');
});

test('structural counts distinguish skipped review and historical missing tracking from quality scores', () => {
  const evaluation = { reviewRequired: false, participants: 2, reviewedRoleIds: ['eevee', 'umbreon'], peerReviews: 2, source: { selected: 0, untraced: 0 }, objections: { open: 1 } };
  const current = render(OfficeCollaborationSummary, { evaluation });
  assert.match(current, /설정에 따라 첫 의견만 검토/);
  assert.match(current, /답변의 정확성이나 독립 검증을 뜻하지 않습니다/);
  assert.doesNotMatch(current, /점수|100%|통과/);
  const previous = render(OfficeCollaborationSummary, { evaluation: { source: { selected: null } } });
  assert.match(previous, /이전 기록/);
  assert.doesNotMatch(previous, /0건/);
  assert.match(render(OfficeCollaborationSummary, { evaluation: { ...evaluation, reviewRequired: true } }), />2\/2</);
});
