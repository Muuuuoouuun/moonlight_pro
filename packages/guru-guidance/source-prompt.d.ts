// Types for the server-only source-prompt module (see source-prompt.js).
import type { GuidanceCard } from './index.ts';

export declare const SOURCE_PROMPT_MAX_CHARS: number;

export interface GuidanceSourceHeading {
  level: number;
  text: string;
  line: number;
}

export interface GuidanceSourceEntry {
  id: string;
  collection: string;
  kind: string;
  name: string;
  title: string;
  docPath: string;
  startLine: number;
  endLine: number;
  charCount: number;
  headings: GuidanceSourceHeading[];
  markdown: string;
  personId?: string;
  legendId?: string;
}

export interface GuidanceSourceExcerpt {
  card: GuidanceCard;
  document: { path: string; title: string } | null;
  entry: GuidanceSourceEntry;
  heading: GuidanceSourceHeading | null;
  approximate: boolean;
  scope: 'entry' | 'section';
  startLine: number;
  endLine: number;
  text: string;
  totalChars: number;
  truncated: boolean;
}

export declare function guidanceSourceExcerpt(cardId: string, options?: { maxChars?: number }): GuidanceSourceExcerpt | null;

export declare function guidanceSourcePrompt(cardId: string, options?: { maxChars?: number }): string;
