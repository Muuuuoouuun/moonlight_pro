"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { guidancePeriodKey, selectGuidanceCard } from '@com-moon/guru-guidance';
import { Button, Drawer, SegmentedControl } from './hub-primitives';
import { Iconed } from './hub-icons';
import { GuidanceSource } from './guidance-source';
import './context-mentor-rail.css';

const DOMAIN_LABELS = { sales: '세일즈', marketing: '마케팅', content: '콘텐츠' };
const MODES = [
  { key: 'daily', label: 'Guru · 실무' },
  { key: 'weekly', label: 'Legend · 판단' },
];

export function ContextMentorRail({ domain = 'sales', onGuidanceAsk, onNavigate, contextLabel, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const [compact, setCompact] = React.useState(false);
  const [cadence, setCadence] = React.useState('daily');
  const [offset, setOffset] = React.useState(0);
  const [now, setNow] = React.useState(() => new Date());
  const selectedDomain = Object.hasOwn(DOMAIN_LABELS, domain) ? domain : 'sales';
  const domainLabel = DOMAIN_LABELS[selectedDomain];

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    setOpen(false);
    setCadence('daily');
    setOffset(0);
  }, [selectedDomain]);

  const card = selectGuidanceCard({ cadence, domain: selectedDomain, now, offset });
  const period = guidancePeriodKey(cadence, now);
  const close = () => setOpen(false);
  const openRail = () => {
    setNow(new Date());
    setOpen(true);
  };
  const changeMode = value => {
    setCadence(value);
    setOffset(0);
  };
  const ask = () => {
    if (cadence !== 'daily' || disabled || !onGuidanceAsk) return;
    setOpen(false);
    onGuidanceAsk?.(card);
  };
  const visitShelf = () => {
    setOpen(false);
    onNavigate?.('dashboard/agents/chat');
  };

  return <div className="context-mentor-rail">
    <button
      type="button"
      className="context-mentor-rail__trigger"
      onClick={openRail}
      aria-label={`${contextLabel || domainLabel} Guru 관점 열기`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span aria-hidden="true"><Iconed name="sparkle" size={19} /></span>
      <span className="context-mentor-rail__mark mono">GURU</span>
      <span className="context-mentor-rail__label">관점 열기</span>
      <span className="context-mentor-rail__arrow" aria-hidden="true"><Iconed name="chevronL" size={16} /></span>
    </button>

    {open && typeof document !== 'undefined' && createPortal(<Drawer
      title="Guru · 조용한 멘토"
      subtitle={`${contextLabel || domainLabel} · 필요할 때 읽는 관점`}
      onClose={close}
      width="min(388px, 100vw)"
      presentation={compact ? 'compact' : 'side'}
    >
      <div className="context-mentor-rail__content">
        <SegmentedControl
          options={MODES}
          value={cadence}
          onChange={changeMode}
          label="멘토 관점 선택"
          fill
        />

        <article className="context-mentor-rail__card" aria-label={cadence === 'daily' ? '오늘의 Guru 관점' : '이번 주의 Legend 관점'}>
          <div className="context-mentor-rail__meta">
            <span>{cadence === 'daily' ? '오늘의 실무 관점' : '이번 주의 판단 관점'}</span>
            <span className="mono">{period} · {offset ? '직접 넘겨본 카드' : cadence === 'daily' ? '일간' : '주간'}</span>
          </div>
          <p className="context-mentor-rail__eyebrow">{cadence === 'daily' ? domainLabel : 'Legend'}</p>
          <h3>{card.person}</h3>
          <p className="context-mentor-rail__frame">{card.frame}</p>
          <p className="context-mentor-rail__text">{card.text}</p>
          <div className="context-mentor-rail__use">
            <span>써볼 때</span>
            <p>{card.useWhen}</p>
          </div>
          <div className="context-mentor-rail__question">
            <span>생각을 여는 질문</span>
            <p>{card.question}</p>
          </div>
          <div className="context-mentor-rail__actions">
            {cadence === 'daily' && !disabled && onGuidanceAsk && <Button variant="primary" onClick={ask}>이 관점으로 질문하기</Button>}
            <Button variant="outline" onClick={() => setOffset(value => value + 1)}>다른 카드 보기</Button>
          </div>
          {cadence === 'daily' && disabled && <p className="context-mentor-rail__read-only">이 맥락에서는 관점만 읽을 수 있습니다.</p>}
        </article>

        <GuidanceSource source={card.source} className="context-mentor-rail__source" />

        <div className="context-mentor-rail__footer">
          <p>열람과 카드 넘김은 조언을 생성하거나 업무를 추가하지 않습니다.</p>
          <Button variant="ghost" iconRight="arrowRight" onClick={visitShelf}>멘토 서가에서 더 보기</Button>
        </div>
      </div>
    </Drawer>, document.querySelector('.hub-app') || document.body)}
  </div>;
}
