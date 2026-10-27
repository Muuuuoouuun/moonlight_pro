"use client";

import React from 'react';
import { Button, Skeleton, TruthBadge } from '../hub-primitives';
import { buildHomeMorningBrief } from './home-morning-brief.js';
import './home-morning-brief.css';

export function HomeMorningBrief({ brief, onNavigate }) {
  const { state, progress } = buildHomeMorningBrief({ brief });
  return (
    <section className="home-handoff" aria-label="실행과 흐름 이어가기">
      <div className="home-handoff__summary">
        <span className="fx-eyebrow">실행은 오늘에서</span>
        {state === 'loading' ? <Skeleton lines={1} label="할 일 확인 중" /> : <p>{progress}</p>}
        {!['live', 'loading'].includes(state) && <TruthBadge state={state} reason={state === 'partial' ? '일부 기록만 확인했습니다' : undefined} />}
      </div>
      <div className="home-handoff__actions">
        <Button variant="secondary" size="sm" onClick={() => onNavigate?.('dashboard/daily-brief')}>오늘에서 할 일 이어가기</Button>
        <Button variant="ghost" size="sm" onClick={() => onNavigate?.('dashboard/overview?view=summary')}>현황에서 흐름 보기</Button>
      </div>
    </section>
  );
}
