"use client";
import React from 'react';
import Link from 'next/link';
import { journalSourceHref, memoCaptureHref } from '@/lib/journal-client';
import { isCanonicalUuid } from '@/lib/uuid';

export function MemoCaptureLink({ context, label = '메모 남기기' }) {
  if (context && !isCanonicalUuid(context.id)) return null;
  return <Link className="hub-row" href={memoCaptureHref(context)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--fg)', fontSize: 12, whiteSpace: 'nowrap' }}>{label}</Link>;
}
export function JournalSources({ refs = [] }) {
  const sources = (Array.isArray(refs) ? refs : []).filter((ref) => journalSourceHref(ref));
  if (!sources.length) return null;
  return <section aria-label="원문 메모 출처" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
    {sources.map((ref, index) => <div key={`${ref.journal_id}:${ref.revision}:${index}`}>
      <Link className="hub-row" href={journalSourceHref(ref)} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'var(--fg)', textDecoration: 'underline', textUnderlineOffset: 4 }}>원문 메모 열기 →</Link>
      <details><summary style={{ cursor: 'pointer', minHeight: 44, color: 'var(--fg-muted)' }}>사용한 발췌 · 원문 v{ref.revision}</summary>
        <blockquote style={{ margin: '8px 0', paddingLeft: 12, borderLeft: '1px solid var(--line-strong)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--fg-muted)', lineHeight: 1.7 }}>{ref.excerpt}</blockquote>
      </details>
    </div>)}
  </section>;
}
