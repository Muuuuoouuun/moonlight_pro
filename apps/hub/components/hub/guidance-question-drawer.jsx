"use client";

import React from 'react';
import { GURU_CARDS } from '@com-moon/guru-guidance';
import { Button, IconButton, TextAreaField, TruthBadge } from './hub-primitives';
import { isTopEscLayer, popEscLayer, pushEscLayer } from './esc-layers';
import { requestGuidanceAdvice } from './guidance-advice-client';
import { GuidanceSource } from './guidance-source';
import './guidance-question-drawer.css';

const DOMAIN_LABELS = { sales: '세일즈', marketing: '마케팅', content: '콘텐츠' };
const CHAT_FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function containChatTab(event, root, activeElement = typeof document === 'undefined' ? null : document.activeElement) {
  if (event.key !== 'Tab' || !root) return;
  const controls = [...root.querySelectorAll(CHAT_FOCUSABLE)];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (activeElement === first || !root.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || !root.contains(activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function inlineEmphasis(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}

export function GuidanceAnswer({ text, announce = true }) {
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
  return <div className="guidance-question__answer-body">
    {announce && <span className="guidance-question__answer-notice" role="status">답변이 도착했습니다.</span>}
    {blocks}
  </div>;
}

function QuestionChat({ card, context = {}, onClose }) {
  const [question, setQuestion] = React.useState('');
  const [turns, setTurns] = React.useState([]);
  const [pending, setPending] = React.useState('');
  const [feedback, setFeedback] = React.useState({ state: 'idle' });
  const [minimized, setMinimized] = React.useState(false);
  const [compact, setCompact] = React.useState(false);
  const inputRef = React.useRef(null);
  const dockRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const logRef = React.useRef(null);
  const sendingRef = React.useRef(false);
  const requestEpoch = React.useRef(0);
  const onCloseRef = React.useRef(onClose);
  const openerRef = React.useRef(null);
  onCloseRef.current = onClose;

  const target = !card || card.domain === 'sales' ? '영업 Guru' : '브랜드 멘토';
  const busy = Boolean(pending);
  const ref = !card || card.domain === 'sales' ? '' : (context?.ref || '');

  React.useEffect(() => {
    openerRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      requestEpoch.current += 1;
      if (openerRef.current?.isConnected) openerRef.current.focus?.();
    };
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  React.useEffect(() => {
    if (minimized) return undefined;
    const layer = pushEscLayer();
    const onKey = (event) => {
      if (event.key === 'Escape' && !event.isComposing && isTopEscLayer(layer)) {
        event.preventDefault();
        onCloseRef.current?.();
      }
      if (event.key === 'Tab' && compact && isTopEscLayer(layer)) {
        containChatTab(event, dialogRef.current);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      popEscLayer(layer);
    };
  }, [minimized, compact]);

  React.useEffect(() => {
    if (minimized) dockRef.current?.focus();
    else inputRef.current?.focus();
  }, [minimized, compact]);

  React.useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, pending, feedback, minimized]);

  const send = async () => {
    const text = question.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = ++requestEpoch.current;
    setQuestion('');
    setPending(text);
    setFeedback({ state: 'idle' });
    let result;
    try {
      result = await requestGuidanceAdvice(card, text, context, turns);
    } catch {
      result = { state: 'error', note: '질문을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    if (epoch !== requestEpoch.current) return;
    sendingRef.current = false;
    setPending('');
    if (result.state === 'done') {
      setTurns(previous => [...previous, {
        question: text,
        answer: result.text,
        ...(card ? { guidanceId: card.id } : {}),
        ...(ref ? { ref } : {}),
      }]);
      setFeedback({ state: 'idle' });
    } else {
      setQuestion(text);
      setFeedback(result);
    }
    if (!minimized && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  if (minimized) return <div className="guidance-chat-dock" aria-label={`${target} 대화 최소화됨`}>
    <Button ref={dockRef} variant="outline" className="guidance-chat-dock__restore" onClick={() => setMinimized(false)}>
      {target} 대화 다시 열기{turns.length ? ` · ${turns.length}회` : ''}
    </Button>
    <IconButton icon="x" size={44} tooltip="대화 닫기" onClick={onClose} />
  </div>;

  return <section ref={dialogRef} className="guidance-chat" role="dialog" aria-modal={compact ? 'true' : 'false'} aria-label={`${target}와 대화`}>
    <header className="guidance-chat__header">
      <div className="guidance-chat__heading">
        <span className="guidance-chat__eyebrow">필요할 때 묻는 멘토</span>
        <h2>{target}와 대화</h2>
      </div>
      <div className="guidance-chat__header-actions">
        <Button variant="ghost" className="guidance-chat__minimize" onClick={() => setMinimized(true)} aria-label="대화 최소화">−</Button>
        <IconButton icon="x" size={44} tooltip="대화 닫기" onClick={onClose} />
      </div>
    </header>

    <div className="guidance-chat__scroll" ref={logRef}>
      {card ? <section className="guidance-chat__lens" aria-label="선택한 멘토 관점">
        <span className="guidance-chat__eyebrow">{DOMAIN_LABELS[card.domain]} · 선택한 관점</span>
        {context?.label && <span className="guidance-chat__context">대상 브랜드 · {context.label}</span>}
        <h3>{card.person}</h3>
        <p>{card.frame}</p>
        <p className="guidance-chat__sample">생각해 볼 질문 · {card.question}</p>
        <GuidanceSource source={card.source} className="guidance-chat__source" />
      </section> : <section className="guidance-chat__lens guidance-chat__lens--free" aria-label="자유 질문">
        <span className="guidance-chat__eyebrow">자유 질문</span>
        <p>상황을 직접 적어 주시면 영업 Guru가 함께 생각할 관점을 정리합니다.</p>
      </section>}

      <div className="guidance-chat__thread" role="log" aria-label="멘토와의 대화" aria-live="polite" aria-relevant="additions text">
        {turns.length === 0 && !pending && <p className="guidance-chat__empty">질문을 보낼 때만 답변합니다. 후속 조치나 업무를 자동으로 만들지 않습니다.</p>}
        {turns.map((turn, index) => <React.Fragment key={`${index}:${turn.question}`}>
          <div className="guidance-chat__message guidance-chat__message--user">
            <span className="guidance-chat__message-label">나</span>
            <p>{turn.question}</p>
          </div>
          <section className="guidance-chat__message guidance-chat__message--mentor" aria-label={`${target}의 답변`}>
            <span className="guidance-chat__message-label">{target}</span>
            <GuidanceAnswer text={turn.answer} announce={index === turns.length - 1} />
          </section>
        </React.Fragment>)}
        {pending && <>
          <div className="guidance-chat__message guidance-chat__message--user">
            <span className="guidance-chat__message-label">나</span>
            <p>{pending}</p>
          </div>
          <p className="guidance-chat__feedback" role="status">관점을 살펴보고 있습니다…</p>
        </>}
      </div>
    </div>

    <form className="guidance-chat__composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      {feedback.state === 'preview' && <p className="guidance-chat__feedback" role="status"><TruthBadge state="preview" label="응답 연결 필요" /> 지금은 답변을 생성할 수 없습니다. {feedback.note}</p>}
      {feedback.state === 'error' && <p className="guidance-chat__feedback" role="alert"><TruthBadge state="error" label="응답 실패" /> 답변을 받지 못했습니다. {feedback.note}</p>}
      <TextAreaField
        ref={inputRef}
        id="guidance-question"
        className="guidance-chat__input"
        label="무엇을 함께 생각해 볼까요?"
        placeholder="상황이나 판단할 지점을 적어 주세요."
        value={question}
        onChange={event => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            send();
          }
        }}
        rows={3}
        maxLength={1200}
        disabled={busy}
        hint="Enter 전송 · Shift+Enter 줄바꿈 · 판단과 실행은 직접 결정합니다."
      />
      <div className="guidance-chat__composer-actions">
        <span>대화 {turns.length}회</span>
        <Button variant="primary" size="sm" className="guidance-chat__send" type="submit" disabled={busy || !question.trim()}>
          {busy ? '답변 받는 중…' : `${target}에게 보내기`}
        </Button>
      </div>
    </form>
  </section>;
}

export function GuidanceQuestionDrawer({ card, context, onClose }) {
  const free = !card && context?.free === true;
  if (!free && (!card || card.kind !== 'guru' || !GURU_CARDS.some(item => item.id === card.id && item.domain === card.domain))) return null;
  return <QuestionChat key={`${card?.id || 'free'}:${context?.ref || ''}`} card={card} context={context} onClose={onClose} />;
}
