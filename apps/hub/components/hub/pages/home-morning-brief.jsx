"use client";

import React from 'react';
import { Button, Skeleton, TruthBadge } from '../hub-primitives';
import { GuidanceInlineTip } from '../guidance-inline-tip';
import { buildHomeMorningBrief } from './home-morning-brief.js';
import './home-morning-brief.css';

export function HomeMorningBrief({ brief, schedule, onNavigate, now = new Date() }) {
  const { state, rows } = buildHomeMorningBrief({ brief, schedule, now });
  const sourceNote = {
    loading: '기록 확인 중',
    live: '확인된 기록 기준',
    preview: '연결된 기록 범위를 확인하세요',
    error: '기록을 확인하지 못했습니다',
    partial: '일부 기록 미확인 · 확인된 항목만 표시',
  }[state];

  return (
    <section className="home-morning" aria-labelledby="home-morning-title">
      <div className="home-morning__heading">
        <h3 id="home-morning-title">아침 브리핑</h3>
        {state !== 'live' && state !== 'loading' ? (
          <TruthBadge state={state} reason={state === 'partial' ? '일부 기록만 확인했습니다' : state === 'preview' ? '연결된 기록이 필요합니다' : '기록을 확인하지 못했습니다'} />
        ) : null}
      </div>
      <div className="fx-card home-morning__card">
        <div className="home-morning__intro">
          <span className="fx-eyebrow">오늘의 시작</span>
          <h4>오늘은 이것부터</h4>
        </div>
        {state === 'loading' ? (
          <div className="home-morning__loading"><Skeleton lines={3} /></div>
        ) : (
          <dl className="home-morning__rows">
            {rows.map(row => (
              <div className="home-morning__row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="home-morning__tip">
          <GuidanceInlineTip variant="today" onNavigate={onNavigate} />
        </div>
        <div className="home-morning__footer">
          <span className="home-morning__source">{sourceNote}</span>
          <div className="home-morning__actions">
            <Button variant="primary" size="sm" onClick={() => onNavigate?.('dashboard/daily-brief')}>오늘 열기</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate?.('dashboard/daily-brief')}>30초 AI 브리핑 열기</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
