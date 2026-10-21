import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { githubPrStatus } from '../../lib/github-pr-task.js';

const source = readFileSync(new URL('./github-pr-mark.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./github-pr-mark.css', import.meta.url), 'utf8');
const compiled = ts.transpile(source.replace(/^"use client";\n/m, '').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
const React = { createElement };
const GitHubPrMark = new Function('React', 'Button', 'LifecycleBadge', 'githubPrStatus', `${compiled}\nreturn GitHubPrMark;`)(React, 'Button', 'LifecycleBadge', githubPrStatus);

const flat = node => [node?.props?.children || []].flat(Infinity).filter(Boolean);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of flat(node)) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
}
const pr = (patch = {}) => ({ repo: 'Muuuuoouuun/moonlight_pro', number: 37, url: 'https://github.com/Muuuuoouuun/moonlight_pro/pull/37', state: 'open', draft: false, ...patch });

test('a merged PR task shows a done lifecycle label and a completion button wired to the caller', () => {
  let completed = 0;
  const tree = GitHubPrMark({ pr: pr({ state: 'merged' }), done: false, title: '오피스 동기화', onComplete: () => { completed += 1; } });
  const link = find(tree, node => node.type === 'a');
  assert.equal(link.props.href, 'https://github.com/Muuuuoouuun/moonlight_pro/pull/37');
  assert.equal(link.props.target, '_blank');
  assert.equal(link.props.rel, 'noopener noreferrer');
  assert.match(link.props['aria-label'], /PR #37 새 창에서 열기 · GitHub에서 병합됨/);
  const badge = find(tree, node => node.type === 'LifecycleBadge');
  assert.deepEqual([badge.props.state, badge.props.label], ['done', 'GitHub에서 병합됨']);
  const button = find(tree, node => node.type === 'Button');
  assert.equal(button.props['aria-label'], 'GitHub에서 병합됨 — 할 일 완료로 표시: 오피스 동기화');
  button.props.onClick();
  assert.equal(completed, 1);
});

test('an open or already completed PR task shows no completion button; a missing link stays plain text', () => {
  const open = GitHubPrMark({ pr: pr({ draft: true }), done: false, onComplete() {} });
  assert.equal(find(open, node => node.type === 'Button'), null);
  assert.equal(find(open, node => node.type === 'LifecycleBadge'), null);
  assert.ok(find(open, node => node.props?.className === 'github-pr-mark__meta'));
  const done = GitHubPrMark({ pr: pr({ state: 'closed' }), done: true, onComplete() {} });
  assert.equal(find(done, node => node.type === 'Button'), null);
  assert.equal(find(done, node => node.type === 'LifecycleBadge').props.state, 'cancelled');
  assert.equal(find(GitHubPrMark({ pr: pr({ url: null }) }), node => node.type === 'a'), null);
  assert.equal(GitHubPrMark({ pr: null }), null);
});

test('the PR mark uses only tokens, 1px lines, motion tokens and a ≥10.5px floor', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.doesNotMatch(css, /\b(?:[2-9]|\d{2,})px solid/);
  assert.doesNotMatch(css, /\d+(?:ms|s)\b/);
  for (const [, size] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(size) >= 10.5, size);
});
