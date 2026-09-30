import React from 'react';
import { SourceMarkdown } from './source-markdown';
import './office-artifact.css';

export function OfficeArtifact({ artifact, className }) {
  const body = typeof artifact?.body === 'string' ? artifact.body : '';
  const classes = ['office-artifact', className].filter(Boolean).join(' ');
  if (artifact?.kind === 'markdown') return <SourceMarkdown markdown={body} className={classes} />;
  if (artifact?.kind === 'code') return <pre className={classes}>{body}</pre>;
  return <div className={classes}>{body}</div>;
}
