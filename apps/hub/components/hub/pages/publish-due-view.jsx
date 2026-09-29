"use client";

import React from 'react';
import { Iconed } from '../hub-icons';
import { Button } from '../hub-primitives';
import { dueUrgency, formatKstShort } from '@/lib/content-schedule';
import './publish-due.css';

const RED_BUDGET = 3; // §5.3 — 빨강은 한 화면에 세 곳까지. 넘으면 개수만 빨갛게 하고 행은 중립으로 접는다.
const CHANNELS = { threads: 'Threads', instagram: 'Instagram', youtube_shorts: 'YouTube Shorts', reels: 'Reels', blog: '블로그', x: 'X', email: '뉴스레터' };

// 그리기만 — 상태·예산 규칙이 여기 있다(렌더 테스트가 고정한다).
export function PublishDueView({ items, busy = '', onOpen, onSnooze, now = Date.now() }) {
  const missed = items.filter((row) => row.state === 'missed').length;
  const compactRed = missed > RED_BUDGET;
  return (
    <section className="fx-card publish-due" aria-label="지금 올릴 글">
      <div className="publish-due-head">
        <h3 className="publish-due-title">지금 올릴 글</h3>
        <span className="publish-due-count">{items.length}건{missed ? <> · <span className="publish-due-missed-count">{missed}건 놓침</span></> : null}</span>
      </div>
      <ul className="publish-due-list">
        {items.map((row) => {
          const isMissed = row.state === 'missed';
          const urgency = isMissed ? 'missed' : dueUrgency(row, now) === 'now' ? 'now' : 'late';
          // 놓침이 예산(3)을 넘으면 행은 중립으로 접고 머리말의 개수만 빨갛게 둔다.
          const rowState = isMissed && compactRed ? 'late' : urgency;
          return (
            <li key={row.variantId} className="publish-due-item" data-state={rowState}>
              <div className="publish-due-meta">
                <span className="mono publish-due-time">{formatKstShort(row.scheduledAt)}</span>
                <span className="publish-due-state"><Iconed name="clock" size={13} />{isMissed ? '놓침 · 밤에 정리됨' : urgency === 'now' ? '지금' : '시각 지남 · 아직 안 올림'}</span>
                <span className="publish-due-channel">{CHANNELS[row.channel] || row.channel}</span>
              </div>
              <div className="publish-due-body">{row.title || '제목 없음'}</div>
              <div className="publish-due-actions">
                <Button size="xs" variant={urgency === 'now' ? 'primary' : 'outline'} onClick={() => onOpen(row)}>원고 열기</Button>
                {!isMissed && <Button size="xs" variant="ghost" disabled={busy === row.variantId} onClick={() => onSnooze(row)}>30분 뒤</Button>}
                {isMissed && <Button size="xs" variant="outline" onClick={() => onOpen(row)}>다른 시간으로</Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
