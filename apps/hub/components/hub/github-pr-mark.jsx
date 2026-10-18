"use client";
import React from 'react';
import { Button, LifecycleBadge } from './hub-primitives';
import { githubPrStatus } from '@/lib/github-pr-task';
import './github-pr-mark.css';

// GitHub PR에서 들어온 할 일의 출처 표시. 병합·닫힘이 되면 상태와 완료 버튼을 보이지만
// 완료는 운영자가 누른다(자동 완료 금지 — 제품 렌즈 §5.3, 2026-10-18 운영자 결정).
export function GitHubPrMark({ pr, done = false, title = '', disabled = false, onComplete }) {
  if (!pr) return null;
  const status = githubPrStatus(pr, done);
  const number = <span className="mono">PR #{pr.number}</span>;
  return <span className="github-pr-mark">
    {pr.url
      ? <a className="github-pr-mark__link" href={pr.url} target="_blank" rel="noopener noreferrer"
        aria-label={`GitHub ${pr.repo} PR #${pr.number} 새 창에서 열기 · ${status.label}`}>{number}</a>
      : <span className="github-pr-mark__link">{number}</span>}
    {pr.draft && <span className="github-pr-mark__meta">초안</span>}
    {status.lifecycle && <LifecycleBadge state={status.lifecycle} label={status.label} />}
    {status.offerComplete && onComplete && <Button size="xs" variant="outline" icon="check" disabled={disabled}
      aria-label={`${status.label} — 할 일 완료로 표시: ${title}`} onClick={onComplete}>완료</Button>}
  </span>;
}
