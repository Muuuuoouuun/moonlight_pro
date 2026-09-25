import React from 'react';
import './guidance-source.css';

export function GuidanceSource({ source, className = '' }) {
  if (!source) return null;
  return <div className={['guidance-source', className].filter(Boolean).join(' ')}>
    <span className="guidance-source__identity">Moonlight 재구성 · 바탕 자료: {source.title} · {source.section}</span>
    {source.application === 'adapted' && <span className="guidance-source__application">Moonlight 응용{source.note ? ` · ${source.note}` : ''}</span>}
  </div>;
}
