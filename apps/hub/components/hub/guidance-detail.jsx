"use client";

import React from 'react';
import { Button, Drawer } from './hub-primitives';
import { GuidanceSource } from './guidance-source';
import { getGuidanceDetailContent } from './guidance-detail-content';
import './guidance-detail.css';

export function GuidanceDetail({ card, onClose, onAsk }) {
  const openingRef = React.useRef(null);
  const content = getGuidanceDetailContent(card);
  if (!card || !content) return null;

  const kind = card.kind === 'legend' ? 'LEGEND / 판단 관점' : 'GURU / 실무 관점';
  const ask = typeof onAsk === 'function' && card.kind === 'guru'
    ? <Button variant="primary" size="md" className="guidance-detail__ask" onClick={() => {
      onClose?.();
      onAsk(card);
    }}>이 관점으로 질문 쓰기</Button>
    : null;

  return <Drawer
    title={card.person}
    subtitle={kind}
    presentation="compact"
    width="min(680px, 96vw)"
    initialFocusRef={openingRef}
    onClose={onClose}
    footer={ask}
  >
    <article ref={openingRef} tabIndex={-1} className="guidance-detail" aria-label={`${card.person} · 주장 상세`}>
      <div className="guidance-detail__opening">
        <span className="guidance-detail__eyebrow">{kind}</span>
        <p className="guidance-detail__frame">{card.frame}</p>
      </div>

      <section className="guidance-detail__section" aria-labelledby="guidance-detail-summary">
        <h3 id="guidance-detail-summary">Moonlight 편집 요약 · 원문의 직접 인용 아님</h3>
        <p className="guidance-detail__summary">{card.text}</p>
        {card.source?.application === 'adapted' && <p className="guidance-detail__note">{card.source.note || '원전의 관점을 Moonlight의 사용 상황에 응용했습니다.'}</p>}
      </section>

      <section className="guidance-detail__section" aria-labelledby="guidance-detail-steps">
        <h3 id="guidance-detail-steps">주장 풀어보기 · Moonlight 해석</h3>
        <ol className="guidance-detail__steps">
          {content.steps.map(step => <li key={step.label}>
            <strong>{step.label}</strong>
            <p>{step.text}</p>
          </li>)}
        </ol>
      </section>

      <div className="guidance-detail__pair">
        <section className="guidance-detail__section" aria-labelledby="guidance-detail-use">
          <h3 id="guidance-detail-use">써볼 때</h3>
          <p>{card.useWhen}</p>
        </section>
        <section className="guidance-detail__section" aria-labelledby="guidance-detail-boundary">
          <h3 id="guidance-detail-boundary">적용 경계</h3>
          <p>{content.boundary}</p>
        </section>
      </div>

      <section className="guidance-detail__section" aria-labelledby="guidance-detail-question">
        <h3 id="guidance-detail-question">스스로 묻는 질문</h3>
        <p className="guidance-detail__question">{card.question}</p>
      </section>

      <section className="guidance-detail__section guidance-detail__source" aria-labelledby="guidance-detail-source">
        <h3 id="guidance-detail-source">원자료 · 원문 확인</h3>
        {content.excerpt
          ? <><p className="guidance-detail__excerpt-label">원문에서 확인한 짧은 발췌</p><blockquote lang="en">“{content.excerpt}”</blockquote></>
          : <p className="guidance-detail__unverified">검증된 직접 인용 미등록 · 원문의 정확한 표현은 아래 자료에서 확인할 수 있습니다.</p>}
        <GuidanceSource source={card.source} />
      </section>
    </article>
  </Drawer>;
}
