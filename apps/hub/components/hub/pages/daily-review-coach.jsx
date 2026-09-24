"use client";

import React from 'react';
import { Button, CertaintyBadge, useToast } from '../hub-primitives';
import { requestPersonaChat } from '../persona-client';
import { ENERGY_LABELS, progressLabel } from './daily-review-labels';

// 저장된 기록에만 붙는 선택형 AI 코칭(2026-09-23 지속 루프 설계 §4.4, 09-12 "AI 없이 저장·재조회").
// 결과는 권장(◇)이며 `메모에 추가`는 draft만 바꾼다 — 저장은 여전히 운영자가 누른다.
// 스타일은 daily-review.css가 소유한다(인라인 style·이모지·raw 타이머 없음).
function coachPrompt(review) {
  const parts = ['[오늘의 하루 회고]'];
  if (review.energy !== null) parts.push(`에너지: ${review.energy}/5 (${ENERGY_LABELS[review.energy - 1]})`);
  if (review.focus) parts.push(`오늘의 목표: ${review.focus}`);
  if (review.progress !== null) parts.push(`진척도: ${progressLabel(review.progress)}`);
  if (review.note) parts.push(`메모:\n${review.note}`);
  parts.push('\n위 내용을 바탕으로 운영자의 오늘 하루를 따뜻하고 객관적으로 1줄 요약하고, 내일 출근 후 가장 먼저 집중해야 할 단 1가지 행동(조언)을 1줄로 제시해줘. 총 2문장 내외로 간결하게 써줘.');
  return parts.join('\n');
}

export function DailyReviewCoach({ review, disabled, onAppendNote }) {
  const toast = useToast();
  const [state, setState] = React.useState('idle'); // idle · loading · done
  const [advice, setAdvice] = React.useState('');

  async function generate() {
    setState('loading');
    try {
      const result = await requestPersonaChat({ personaId: 'council', mode: 'advice', draft: coachPrompt(review) });
      if (result.state === 'done' && result.text) { setAdvice(result.text); setState('done'); return; }
      toast.error(result.note || '코칭을 만들지 못했어요. 기록은 그대로 저장돼 있어요.');
    } catch {
      toast.error('코칭을 만들지 못했어요. 기록은 그대로 저장돼 있어요.');
    }
    setState('idle');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(advice);
      toast.success('코칭을 복사했어요.');
    } catch {
      toast.error('복사하지 못했어요.');
    }
  }

  if (state !== 'done') {
    return <div className="daily-review-coach-trigger">
      <Button variant="ghost" size="sm" icon="sparkle" disabled={disabled || state === 'loading'} onClick={generate}>
        {state === 'loading' ? '코칭 만드는 중…' : '저장한 기록으로 코칭 받기'}
      </Button>
    </div>;
  }

  return <section className="daily-review-coach" aria-label="AI 코칭">
    <div className="daily-review-coach-head">
      <CertaintyBadge state="recommended" />
      <span>AI 코칭 · 내일의 한 수</span>
    </div>
    <p className="daily-review-coach-text">{advice}</p>
    <div className="daily-review-coach-actions">
      <Button variant="ghost" size="sm" icon="copy" onClick={copy}>복사</Button>
      <Button variant="outline" size="sm" icon="plus" disabled={disabled} onClick={() => { onAppendNote(`[AI 코칭]\n${advice}`); toast.success('메모에 추가했어요. 저장해야 남아요.'); }}>메모에 추가</Button>
      <Button variant="ghost" size="sm" onClick={() => setState('idle')}>접기</Button>
    </div>
  </section>;
}
