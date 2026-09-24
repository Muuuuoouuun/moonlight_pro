"use client";

import React from 'react';
import { GURU_CARDS } from '@com-moon/guru-guidance';
import { Button, Drawer, TextAreaField, TruthBadge } from './hub-primitives';
import { requestGuidanceAdvice } from './guidance-advice-client';
import './guidance-question-drawer.css';

const DOMAIN_LABELS = { sales: '세일즈', marketing: '마케팅', content: '콘텐츠' };

function inlineEmphasis(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}

export function GuidanceAnswer({ text }) {
  const blocks = [];
  let bullets = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{bullets.map((item, index) => <li key={index}>{inlineEmphasis(item)}</li>)}</ul>);
    bullets = [];
  };
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flushBullets(); continue; }
    const bullet = line.match(/^[*-]\s+(.+)$/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flushBullets();
    const heading = line.match(/^\*\*(.+)\*\*$/) || line.match(/^#{1,4}\s+(.+)$/);
    if (heading) blocks.push(<h4 key={`heading-${blocks.length}`}>{inlineEmphasis(heading[1])}</h4>);
    else blocks.push(<p key={`paragraph-${blocks.length}`}>{inlineEmphasis(line)}</p>);
  }
  flushBullets();
  return <div className="guidance-question__answer-body">{blocks}</div>;
}

function useCompactDrawer() {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

function QuestionDrawerBody({ card, context, onClose }) {
  const [question, setQuestion] = React.useState(card.question || '');
  const [result, setResult] = React.useState({ state: 'idle' });
  const inputRef = React.useRef(null);
  const compact = useCompactDrawer();
  const target = card.domain === 'sales' ? '영업 Guru' : '브랜드 멘토';
  const busy = result.state === 'sending';

  const send = async () => {
    if (busy || !question.trim()) return;
    setResult({ state: 'sending' });
    setResult(await requestGuidanceAdvice(card, question, context));
  };

  return (
    <Drawer
      title={`${target}에게 묻기`}
      subtitle="질문을 전송할 때만 멘토가 응답합니다."
      onClose={onClose}
      initialFocusRef={inputRef}
      width="min(490px, 100vw)"
      presentation={compact ? 'compact' : 'side'}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
        <Button variant="primary" size="sm" disabled={busy || !question.trim()} onClick={send}>
          {busy ? '답변 받는 중…' : `${target}에게 보내기`}
        </Button>
      </>}
    >
      <section className="guidance-question__frame" aria-label="선택한 멘토 관점">
        <span className="guidance-question__eyebrow">{DOMAIN_LABELS[card.domain]} · 선택한 관점</span>
        {context?.label && <span className="guidance-question__context">대상 브랜드 · {context.label}</span>}
        <h3>{card.person}</h3>
        <p>{card.frame}</p>
        <span className="guidance-question__source">자료 요약 · {card.source.title} · {card.source.section}</span>
      </section>

      <TextAreaField
        ref={inputRef}
        id="guidance-question"
        label="무엇을 함께 생각해 볼까요?"
        value={question}
        onChange={event => setQuestion(event.target.value)}
        onCmdEnter={send}
        rows={5}
        maxLength={4000}
        hint="선택한 관점을 참고합니다. 질문을 보내도 업무나 승인 요청은 생성되지 않습니다."
      />

      {result.state === 'sending' && <p className="guidance-question__feedback" role="status">관점을 살펴보고 있습니다…</p>}
      {result.state === 'done' && <section className="guidance-question__answer" aria-label="멘토 답변">
        <span className="guidance-question__eyebrow">{target}의 답변</span>
        <GuidanceAnswer text={result.text} />
        <small>참고할 관점입니다. 실행 여부는 직접 결정합니다.</small>
      </section>}
      {result.state === 'preview' && <p className="guidance-question__feedback" role="status"><TruthBadge state="preview" label="응답 연결 필요" /> 지금은 답변을 생성할 수 없습니다. {result.note}</p>}
      {result.state === 'error' && <p className="guidance-question__feedback" role="alert"><TruthBadge state="error" label="응답 실패" /> 답변을 받지 못했습니다. {result.note}</p>}
    </Drawer>
  );
}

export function GuidanceQuestionDrawer({ card, context, onClose }) {
  if (!card || card.kind !== 'guru' || !GURU_CARDS.some(item => item.id === card.id && item.domain === card.domain)) return null;
  return <QuestionDrawerBody key={`${card.id}:${context?.ref || ''}`} card={card} context={context} onClose={onClose} />;
}
