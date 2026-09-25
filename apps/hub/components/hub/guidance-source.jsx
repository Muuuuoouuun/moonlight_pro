import React from 'react';
import './guidance-source.css';

export function safeGuidanceSourceUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function GuidanceSource({ source, className = '' }) {
  if (!source) return null;
  const url = safeGuidanceSourceUrl(source.url);
  return <div className={['guidance-source', className].filter(Boolean).join(' ')}>
    <span className="guidance-source__identity">자료 요약 · {source.title} · {source.section}</span>
    {source.application === 'adapted' && <span className="guidance-source__application">Moonlight 응용{source.note ? ` · ${source.note}` : ''}</span>}
    {url
      ? <a className="guidance-source__link" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${source.title} 원전 열기 (새 창)`}>원전 열기 ↗</a>
      : <span className="guidance-source__status">내부 요약 · 원전 링크 미확인</span>}
    {source.path && <details className="guidance-source__details">
      <summary>내부 자료 경로</summary>
      <span className="guidance-source__path mono">{source.path}</span>
    </details>}
  </div>;
}
