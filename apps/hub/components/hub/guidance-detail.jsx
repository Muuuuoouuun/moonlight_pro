"use client";

import React from 'react';
import { Button, Drawer, Skeleton } from './hub-primitives';
import { GuidanceSource } from './guidance-source';
import { getGuidanceDetailContent } from './guidance-detail-content';
import { fetchGuruArticle } from './guidance-detail-client';
import { GuruArticleBody, parseGuruArticle } from './guru-article-markdown';
import './guidance-detail.css';

export function GuidanceDetail({ card, onClose, onAsk }) {
  const openingRef = React.useRef(null);
  const [retryKey, setRetryKey] = React.useState(0);
  const [articleState, setArticleState] = React.useState({ id: null, status: 'loading' });
  const cardId = card?.id;
  const content = getGuidanceDetailContent(card);

  React.useEffect(() => {
    if (!cardId) return;
    const controller = new AbortController();
    let active = true;
    setArticleState({ id: cardId, status: 'loading' });
    fetchGuruArticle(cardId, fetch, { signal: controller.signal })
      .then(data => {
        const article = parseGuruArticle(data.markdown);
        if (!article) throw new Error('글의 형식을 읽지 못했습니다.');
        if (active) setArticleState({ id: cardId, status: 'ready', article });
      })
      .catch(() => {
        if (active) setArticleState({ id: cardId, status: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [cardId, retryKey]);

  if (!card || !content) return null;

  const kind = card.kind === 'legend' ? 'LEGEND / 판단 관점' : 'GURU / 실무 관점';
  const visibleState = articleState.id === cardId ? articleState : { status: 'loading' };
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
    <article ref={openingRef} tabIndex={-1} className="guidance-detail" aria-label={`${card.person} · Moonlight 글`}>
      <header className="guidance-detail__opening">
        <span className="guidance-detail__eyebrow">{kind} · MOONLIGHT READING</span>
        <p className="guidance-detail__frame">{card.frame}</p>
        <p className="guidance-detail__editor-note">참고자료를 바탕으로 Moonlight가 재구성한 글입니다. 인물의 직접 발언은 따로 표시합니다.</p>
      </header>
      <span role="status" aria-live="polite" className="guidance-detail__read-status">
        {visibleState.status === 'ready' ? `${visibleState.article.title} 글을 읽을 수 있습니다.` : ''}
      </span>

      {visibleState.status === 'loading' && <div className="guidance-detail__loading"><Skeleton lines={7} height={13} label="멘토 글 불러오는 중" /></div>}
      {visibleState.status === 'error' && <div role="alert" className="guidance-detail__error">
        <p>글을 읽지 못했습니다. 다시 시도해주세요.</p>
        <Button variant="outline" size="md" onClick={() => setRetryKey(value => value + 1)}>다시 읽기</Button>
      </div>}
      {visibleState.status === 'ready' && <>
        <div className="guidance-detail__article-head">
          <span>MOONLIGHT / MENTOR NOTE</span>
          <h2>{visibleState.article.title}</h2>
        </div>
        <GuruArticleBody article={visibleState.article} />
        <section className="guidance-detail__closing" aria-label="생각해 볼 질문">
          <span>읽고 나서 묻기</span>
          <p>{card.question}</p>
        </section>
        {content.excerpt && <section className="guidance-detail__excerpt" aria-label="확인된 원문 발췌">
          <span>확인된 원문 발췌</span>
          <blockquote lang="en">“{content.excerpt}”</blockquote>
        </section>}
      </>}

      <footer className="guidance-detail__source" aria-label="글의 바탕 자료">
        <GuidanceSource source={card.source} />
      </footer>
    </article>
  </Drawer>;
}
