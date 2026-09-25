"use client";

import React from 'react';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import salesInfographics from '../../content/guru/infographics-sales.json' with { type: 'json' };
import otherInfographics from '../../content/guru/infographics-other.json' with { type: 'json' };

const CARD_IDS = new Set([...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id));
const INFOGRAPHICS = new Map([...salesInfographics, ...otherInfographics].map(item => [item.id, item]));

export function getGuruInfographic(card) {
  return card && CARD_IDS.has(card.id) ? INFOGRAPHICS.get(card.id) || null : null;
}

export function getGuruInfographicAlt(data) {
  const points = data.nodes.map(node => `${node.label}: ${node.detail}`).join('. ');
  return `${data.title}. ${points}. 적용 경계: ${data.boundary}`;
}

function InfographicText({ data }) {
  return <div className={`guidance-detail__infographic-text guidance-detail__infographic-text--${data.layout}`}>
    <strong className="guidance-detail__infographic-title">{data.title}</strong>
    <div className="guidance-detail__infographic-nodes">
      {data.nodes.map((node, index) => <div className="guidance-detail__infographic-node" key={`${data.id}-${node.label}`}>
        <span className="guidance-detail__infographic-index num">{String(index + 1).padStart(2, '0')}</span>
        <strong>{node.label}</strong>
        <p>{node.detail}</p>
      </div>)}
    </div>
    <p className="guidance-detail__infographic-boundary"><span>적용 경계</span>{data.boundary}</p>
  </div>;
}

export function GuruArticleInfographic({ card }) {
  const [failed, setFailed] = React.useState(false);
  const data = getGuruInfographic(card);
  if (!data) return null;

  return <figure className="guidance-detail__infographic">
    <div className="guidance-detail__infographic-media">
      {failed
        ? <InfographicText data={data} />
        : <img
          src={`/api/hub/guidance-articles/${encodeURIComponent(card.id)}/infographic`}
          alt={getGuruInfographicAlt(data)}
          width="1536"
          height="1024"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />}
    </div>
    <div className="guidance-detail__infographic-mobile"><InfographicText data={data} /></div>
    <figcaption><span>한눈에 보기</span>{data.takeaway}</figcaption>
  </figure>;
}
