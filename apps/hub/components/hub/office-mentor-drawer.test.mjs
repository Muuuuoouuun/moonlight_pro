import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfficeMentorReferenceCard } from './office-mentor-drawer.jsx';

const card = props => renderToStaticMarkup(React.createElement(OfficeMentorReferenceCard, { answer: '다른 관점의 답변', target: '브랜드 멘토', ...props }));

test('a mentor answer written from the whole Office source carries no partial note', () => {
  const html = card({ sourceTruncation: null });
  assert.match(html, /다른 관점 · 브랜드 멘토 답변 보기<\/summary>/);
  assert.doesNotMatch(html, /원문 일부/);
  assert.doesNotMatch(html, /data-truth="partial"/);
});

test('a mentor answer written from a cut Office source says so in its summary and body', () => {
  const html = card({ sourceTruncation: [{ label: '본문', total: 30000, sent: 24704 }, { label: '근거 2', total: 1000, sent: 600 }] });
  assert.match(html, /다른 관점 · 브랜드 멘토 답변 보기 · 원문 일부 전달<\/summary>/);
  assert.match(html, /data-truth="partial"[^>]*>.*?원문 일부 전달<\/span>/);
  assert.match(html, /멘토는 Office 원문 일부만 받았습니다 · 본문 30,000자 중 24,704자 · 근거 2 1,000자 중 600자\. 전체 원문은 Office 결과 카드에 있습니다\./);
  assert.match(html, /다른 관점의 답변/);
});

test('every follow-up answer and the result card pass the turn source note through', () => {
  const drawer = fs.readFileSync(new URL('./office-mentor-drawer.jsx', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('./office-mentor-drawer.css', import.meta.url), 'utf8');
  assert.match(drawer, /<OfficeMentorReferenceCard key=\{turn\.id\} answer=\{turn\.answer\} target=\{target\} sourceTruncation=\{turn\.sourceTruncation\} \/>/);
  assert.match(drawer, /<PartialSourceNote sourceTruncation=\{turn\.sourceTruncation\} \/><p>\{turn\.answer\}<\/p>/);
  assert.match(page, /sourceTruncation=\{mentorSession\.turns\[0\]\.sourceTruncation\}/);
  assert.match(page, /officeMentorSessions\.discard\(session\.turns\.map\(turn => turn\.id\)\)/);
  assert.match(css, /p\.office-mentor__partial[^{]*\{[^}]*font-size: 12px/);
});
