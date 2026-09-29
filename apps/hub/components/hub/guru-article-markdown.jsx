import React from 'react';

// The articles are authored locally. Keep the reader deliberately limited: no
// HTML, link, image, or Markdown plugin can become executable page content.
export function parseGuruArticle(markdown) {
  if (typeof markdown !== 'string' || markdown.length > 20_000) return null;
  const lines = markdown.replace(/\r\n?/g, '\n').trim().split('\n');
  const title = lines.shift()?.match(/^# (.+)$/)?.[1]?.trim();
  if (!title) return null;
  const blocks = [];
  let paragraph = [];
  let list = [];
  let quote = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    if (list.length) blocks.push({ type: 'list', items: list });
    if (quote.length) blocks.push({ type: 'quote', text: quote.join(' ') });
    paragraph = [];
    list = [];
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length || quote.length) flush();
      list.push(line.slice(2).trim());
    } else if (line.startsWith('> ')) {
      if (paragraph.length || list.length) flush();
      quote.push(line.slice(2).trim());
    } else {
      if (list.length || quote.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return { title, blocks };
}

export function GuruArticleBody({ article }) {
  if (!article) return null;
  return <div className="guidance-article__body">
    {article.blocks.map((block, index) => {
      if (block.type === 'heading') return <h3 key={index}>{block.text}</h3>;
      if (block.type === 'paragraph') return <p key={index}>{block.text}</p>;
      if (block.type === 'quote') return <blockquote key={index}>{block.text}</blockquote>;
      if (block.type === 'list') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
      return null;
    })}
  </div>;
}
