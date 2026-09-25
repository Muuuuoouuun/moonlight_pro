#!/usr/bin/env node
// Builds the verbatim Guru/Legend source library from the original Markdown documents.
//
//   node scripts/build-guidance-source-library.mjs          → write the generated modules
//   node scripts/build-guidance-source-library.mjs --check  → fail when they are stale
//
// Every line of every document lands in exactly one entry, and concatenating a document's
// entries reproduces the LF-normalized document byte for byte. Nothing is summarized,
// shortened or rewritten here: the cards stay the reviewed entry point, and this library is
// the original text behind them. Entry boundaries are the exact heading lines listed in
// SOURCE_CONFIG, so a renamed heading fails loudly instead of silently moving text.
//
// Outputs (plain ESM data, LF line endings on every OS):
//   packages/guru-guidance/source-library.generated.js — documents + entries with Markdown
//   packages/guru-guidance/source-people.generated.js  — small person roster without text,
//     so the mentor shelf can list people with originals while the full library stays a
//     lazily loaded chunk.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const LIBRARY_OUTPUT = 'packages/guru-guidance/source-library.generated.js';
export const PEOPLE_OUTPUT = 'packages/guru-guidance/source-people.generated.js';
export const QUALITY_REVIEW_PATH = 'docs/research/2026-09-24-guru-source-quality.md';

const guru = (heading, personId, name) => ({ heading, kind: 'person', personId, name });
const legend = (heading, legendId, name) => ({ heading, kind: 'person', legendId, name });
const synthesis = (heading, slug) => ({ heading, kind: 'synthesis', slug });

// Verification notes restate docs/research/2026-09-24-guru-source-quality.md: what was
// checked against a primary source and what was not. They never restate the originals.
export const SOURCE_CONFIG = [
  {
    collection: 'sales',
    path: 'docs/sales-guru-knowledge-base.md',
    verification: {
      status: 'partial',
      checked: [
        'Dale Carnegie 공식 30원칙과 대조해 Carnegie에게 붙은 일부 기법·반응 예시 표현을 고쳤다.',
        'Huthwaite International의 SPIN 설명과 대조해 SPIN을 고정 질문 순서로 쓴 부분을 고쳤다.',
        'Ziglar·Carnegie·Hill·Girard·Tracy·Cardone·Belfort·Lemkin은 카드로 옮긴 관점만 각자의 1차 자료와 대조했다.',
      ],
      unverified: '그 밖의 인물별 인용문, 정확한 수치, 보편적 성과 표현은 원전과 대조하지 않았다.',
    },
    sections: [
      synthesis('# PART 1. 올타임 레전드', 'part-1'),
      guru('## 🏆 올타임 레전드 Vol.1 — Zig Ziglar', 'zig-ziglar', 'Zig Ziglar'),
      guru('## 🏆 올타임 레전드 Vol.2 — Dale Carnegie', 'dale-carnegie', 'Dale Carnegie'),
      synthesis('## Ziglar vs Carnegie 비교', 'ziglar-vs-carnegie'),
      guru('## 🏆 올타임 레전드 Vol.3 — Napoleon Hill', 'napoleon-hill', 'Napoleon Hill'),
      synthesis('## 3인 레전드 통합 공식', 'legends-3-formula'),
      guru('## 🏆 올타임 레전드 Vol.4 — Joe Girard', 'joe-girard', 'Joe Girard'),
      synthesis('## 4인 레전드 통합 매트릭스', 'legends-4-matrix'),
      guru('## 🏆 올타임 레전드 Vol.5 — Brian Tracy', 'brian-tracy', 'Brian Tracy'),
      synthesis('## 🏆 올타임 레전드 5인 최종 통합', 'legends-5-integration'),
      synthesis('# PART 2. 현대 구루', 'part-2'),
      guru('## 🔥 현대 구루 Vol.1 — Grant Cardone', 'grant-cardone', 'Grant Cardone'),
      synthesis('## 📊 현대 구루 vs 올타임 레전드 비교', 'modern-vs-legends'),
      guru('## 🐺 현대 구루 Vol.2 — Jordan Belfort', 'jordan-belfort', 'Jordan Belfort'),
      synthesis('## 📊 현대 구루 2인 비교', 'modern-2-compare'),
      synthesis('## 🏆 지금까지 7인 통합 포지션', 'position-7'),
      guru('## 📊 현대 구루 Vol.3 — Neil Rackham', 'neil-rackham', 'Neil Rackham'),
      synthesis('## 📊 현대 구루 3인 비교', 'modern-3-compare'),
      synthesis('## 🏆 지금까지 8인 통합 포지션', 'position-8'),
      guru('## 🎯 현대 구루 Vol.4 — Chris Voss', 'chris-voss', 'Chris Voss'),
      synthesis('## 📊 현대 구루 4인 최종 비교', 'modern-4-compare'),
      synthesis('## 🏆 레전드 9인 완전 통합 시스템', 'legends-9-system'),
      synthesis('## 🎓 9인 레전드 최종 매트릭스', 'legends-9-matrix'),
      synthesis('# PART 3. 테크/SaaS 구루', 'part-3'),
      guru('## 💻 테크/SaaS 구루 Vol.1 — Aaron Ross', 'aaron-ross', 'Aaron Ross'),
      guru('## 🚀 테크/SaaS 구루 Vol.2 — Jason Lemkin', 'jason-lemkin', 'Jason Lemkin'),
      synthesis('## 📊 테크 구루 2인 비교', 'tech-2-compare'),
      synthesis('## 🏆 지금까지 10인 통합 포지션', 'position-10'),
      guru('## 테크/SaaS 구루 Vol.3 — Keenan', 'keenan', 'Keenan'),
      synthesis('## 테크 구루 3인 최종 비교', 'tech-3-compare'),
    ],
  },
  {
    collection: 'marketing',
    path: 'docs/marketing-branding-gurus.md',
    verification: {
      status: 'partial',
      checked: [
        '『Ogilvy on Advertising』과 대조해 오길비의 인쇄 광고 관찰을 모든 광고의 “헤드라인은 80%” 법칙으로 넓힌 부분을 고쳤다.',
      ],
      unverified: '약력·명언과 “반드시”, “완전히” 같은 단정 표현은 개별 확인 전이다.',
    },
    sections: [
      guru('# 1. 세스 고딘 (Seth Godin)', 'seth-godin', 'Seth Godin'),
      guru('# 2. 데이비드 오길비 (David Ogilvy)', 'david-ogilvy', 'David Ogilvy'),
      guru('# 3. 도날드 밀러 (Donald Miller)', 'donald-miller', 'Donald Miller'),
      synthesis('# 4. 세 구루 비교 분석', 'comparison'),
      synthesis('# 5. 통합 적용 가이드', 'integration-guide'),
      synthesis('## 부록: 한눈에 보는 세 구루의 한 문장', 'appendix'),
    ],
  },
  {
    collection: 'content',
    path: 'docs/content-storytelling-people-v2.md',
    verification: {
      status: 'partial',
      checked: [
        'Kane Kallaway 인터뷰 공개 소개와 대조해 도입부 제작시간 80%를 A등급 근거로 쓴 표와 실행 문구를 고쳤다.',
        '검증되지 않은 90분·270편 전환 공식과 직접 발언 여부가 불분명한 영문 인용문을 빼거나 가설로 표시했다.',
      ],
      unverified: '심리학 연구에서 제작 규칙으로 건너뛴 추론은 검증 전이다. A/B/C 등급은 해당 플랫폼·한국 학원 시장의 효과 확인이 아니며, 90분·80%·30% 같은 경험칙은 효과 수치가 아니다.',
    },
    sections: [
      synthesis('# PART 0. 읽는 법 — 증거 등급과 4개의 심리학 렌즈', 'part-0'),
      synthesis('# PART I. 인물 카드 10 (확장판)', 'part-1'),
      guru('## 01. Kane Kallaway — "숏폼은 예술이 아니라 역설계 가능한 시스템"', 'kane-kallaway', 'Kane Kallaway'),
      guru('## 02. Alex Hormozi — "콘텐츠는 작품이 아니라 광고 자산이다"', 'alex-hormozi', 'Alex Hormozi'),
      guru('## 03. MrBeast (Jimmy Donaldson) — "리텐션은 감이 아니라 초 단위 사양서다"', 'mrbeast', 'MrBeast (Jimmy Donaldson)'),
      guru('## 04. Paddy Galloway — "100만 뷰와 2,800만 뷰의 차이는 패키징이다"', 'paddy-galloway', 'Paddy Galloway'),
      guru('## 05. Brendan Kane — "3초 안에 존재를 증명하라"', 'brendan-kane', 'Brendan Kane'),
      guru('## 06. Nathan Baugh — "세계를 먼저 짓고, 이야기로 전달하라"', 'nathan-baugh', 'Nathan Baugh'),
      guru('## 07. Harry Dry — "카피는 시각화·반증·독점이 되는가로만 판정한다"', 'harry-dry', 'Harry Dry'),
      guru('## 08. Justin Welsh — "콘텐츠는 영감이 아니라 운영체제다"', 'justin-welsh', 'Justin Welsh'),
      guru('## 09. Dan Koe — "복리가 붙는 건 뷰가 아니라 메시지다"', 'dan-koe', 'Dan Koe'),
      guru('## 10. Colin & Samir / Jay Clouse — "산업을 읽는 메타 레이어"', 'colin-samir-jay-clouse', 'Colin & Samir / Jay Clouse'),
      synthesis('# PART II. 교차 분석 (확장)', 'part-2'),
      synthesis('# PART III. 한국 시장 문화심리 캘리브레이션', 'part-3'),
      synthesis('# PART IV. 실행 자산 (확장)', 'part-4'),
      synthesis('# PART V. 출처', 'part-5'),
    ],
  },
  {
    collection: 'legend-values',
    path: 'docs/superpowers/specs/2026-09-12-legend-values-persona-cards.md',
    verification: {
      status: 'not-reviewed',
      checked: [],
      unverified: '2026-09-24 Guru 출처 점검의 대상 문서가 아니다. 그 점검에서 인용·수치·원전 링크를 대조하지 않았고, 문서가 밝힌 자체 확인 범위는 원문 §7에 있다.',
    },
    sections: [
      synthesis('## 1. 개발 방향', 'direction'),
      synthesis('## 2. 가치의 차이', 'value-differences'),
      synthesis('## 3. 인물별 카드', 'cards'),
      legend('### 3.1 소크라테스 — 내 선택을 정직하게 설명할 수 있는가', 'socrates', 'Socrates'),
      legend('### 3.2 아인슈타인 — 자유롭게 탐구하면서 누구에게 책임지는가', 'einstein', 'Albert Einstein'),
      legend('### 3.3 에이브러햄 링컨 — 원칙을 지키면서 관계를 어떻게 회복할 것인가', 'lincoln', 'Abraham Lincoln'),
      legend('### 3.4 시어도어 루스벨트 — 참여할 용기와 공정한 규칙을 함께 보는가', 'theodore-roosevelt', 'Theodore Roosevelt'),
      legend('### 3.5 프랭클린 D. 루스벨트 — 변화 속에서도 지킬 생활의 기반은 무엇인가', 'franklin-roosevelt', 'Franklin D. Roosevelt'),
      legend('### 3.6 스티브 잡스 — 내게 의미 있는 일을 어떤 경험으로 완성할 것인가', 'jobs', 'Steve Jobs'),
      legend('### 3.7 제프 베이조스 — 고객 가치를 오래 쌓기 위해 무엇을 먼저 배울 것인가', 'bezos', 'Jeff Bezos'),
      legend('### 3.8 워런 버핏 — 이해하는 가치에 시간과 자원을 배분하는가', 'buffett', 'Warren Buffett'),
      legend('### 3.9 이본 쉬나드 — 소중한 목적이 운영 방식에도 남아 있는가', 'chouinard', 'Yvon Chouinard'),
      synthesis('## 4. 같은 상황에서 달라져야 할 조언', 'same-situation'),
      synthesis('## 5. Mentor·Council 적용', 'mentor-council'),
      synthesis('## 6. 자체 점검과 개발 평가', 'self-check'),
      synthesis('## 7. 이번 개발의 확인 범위', 'scope'),
    ],
  },
  {
    collection: 'legend-framework',
    path: 'docs/superpowers/specs/2026-09-21-council-mentor-guru-legend-operating-framework.md',
    verification: {
      status: 'not-reviewed',
      checked: [],
      unverified: '2026-09-24 Guru 출처 점검의 대상 문서가 아니다. 그 점검에서 인용·수치·원전 출처를 대조하지 않았다.',
    },
    sections: [
      synthesis('## 1. 4대 기둥(Council · Mentor · Guru · Legend)의 엄격한 정의와 계층 구조', 'pillars'),
      synthesis('## 2. 2026-09-13 파일럿 실측 실패 분석 및 5대 방어 가드레일', 'pilot-guardrails'),
      synthesis('## 3. 구루(Guru) 실무 방법론 & 플레이북 체계 디벨롭', 'guru-playbooks'),
      synthesis('## 4. 레전드(Legend) 가치관 카드 v2: 실행용 마이크로 카드 라이브러리', 'legend-cards-v2'),
      legend('#### 1. 소크라테스 (Socrates) — 지적 정직성과 무지의 자각', 'socrates', 'Socrates'),
      legend('#### 2. 아인슈타인 (Albert Einstein) — 가정의 전환과 사고실험', 'einstein', 'Albert Einstein'),
      legend('#### 3. 에이브러햄 링컨 (Abraham Lincoln) — 원칙의 고수와 품격 있는 화해', 'lincoln', 'Abraham Lincoln'),
      legend('#### 4. 시어도어 루스벨트 (Theodore Roosevelt) — 경기장의 투사와 공정한 룰', 'theodore-roosevelt', 'Theodore Roosevelt'),
      legend('#### 5. 프랭클린 D. 루스벨트 (Franklin D. Roosevelt) — 생활 기반 보호와 가역적 대담한 실험', 'franklin-roosevelt', 'Franklin D. Roosevelt'),
      legend('#### 6. 스티브 잡스 (Steve Jobs) — 타협 없는 완성도와 본질에의 집중', 'jobs', 'Steve Jobs'),
      legend('#### 7. 제프 베이조스 (Jeff Bezos) — 고객 집착과 가역적 결정의 학습 속도', 'bezos', 'Jeff Bezos'),
      legend('#### 8. 워런 버핏 (Warren Buffett) — 능력 범위(Circle of Competence)와 기회비용', 'buffett', 'Warren Buffett'),
      legend('#### 9. 이본 쉬나드 (Yvon Chouinard) — 목적과 수단의 일치와 지속 가능성', 'chouinard', 'Yvon Chouinard'),
      synthesis('### 4.2 신규 확장 5인 마이크로 카드 (Operational Extensions)', 'legend-extensions-5'),
      legend('#### 10. 리처드 파인만 (Richard Feynman) — 과학적 정직성과 자기기만 방지', 'feynman', 'Richard Feynman'),
      legend('#### 11. W. 에드워즈 데밍 (W. Edwards Deming) — 시스템적 사고와 작은 실험(PDSA)', 'deming', 'W. Edwards Deming'),
      legend('#### 12. 피터 드러커 (Peter Drucker) — 고객 중심성과 공헌(Contribution)', 'drucker', 'Peter Drucker'),
      legend('#### 13. 엘리너 오스트롬 (Elinor Ostrom) — 공동 자원 거버넌스와 상호 신뢰의 룰', 'ostrom', 'Elinor Ostrom'),
      legend('#### 14. 에픽테토스 (Epictetus) — 통제의 이분법(Dichotomy of Control)', 'epictetus', 'Epictetus'),
      synthesis('### 4.3 인간관계·설득 & 자기확신 확장 2인 (Persuasion & Inner Conviction)', 'legend-extensions-2'),
      legend('#### 15. 데일 카네기 (Dale Carnegie) — 에고의 포기와 상대방 중심 경청', 'carnegie', 'Dale Carnegie'),
      legend('#### 16. 나폴레온 힐 (Napoleon Hill) — 명확한 목표(Chief Aim)와 등가 대가의 법칙', 'hill', 'Napoleon Hill'),
      synthesis('## 5. 멘토(Mentor) 체계 디벨롭: 1:1 지속 코칭 & 피드백 루프', 'mentor'),
      synthesis('## 6. 카운슬(Council) 체계 디벨롭: 다각적 교차 검토 & 스파링', 'council'),
      synthesis('## 7. 품질 보증 & 안티-환각 자동 평가 프레임워크 v2 (Eval v2)', 'eval'),
      synthesis('## 8. 시스템 아키텍처 및 런타임 데이터 계약 (Schema & Integration)', 'architecture'),
      synthesis('## 9. 운영자 점검 체크리스트 & 행동 수칙', 'checklist'),
      synthesis('## 10. 가치관(Values) 및 지식(Knowledge) 통합 지침 설정 체계 (Directives System)', 'directives'),
    ],
  },
];

// CRLF → LF (the checkout uses core.autocrlf=true) and a leading BOM, if any, is dropped as an
// encoding artifact. Nothing else changes: this is the text every entry is cut from.
export function normalizeSourceText(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

// Lines keep their "\n" so that joining them reproduces the text exactly.
export function splitSourceLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

function headingText(raw) {
  return String(raw ?? '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
}

// ATX headings outside fenced code (a ```markdown sample block may hold "### …" lines).
export function scanSourceHeadings(lines) {
  const headings = [];
  let fence = null;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\n$/, '');
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) fence = null;
      return;
    }
    if (fenceMatch && !(fenceMatch[1][0] === '`' && fenceMatch[2].includes('`'))) {
      fence = fenceMatch[1];
      return;
    }
    const match = ATX_RE.exec(line);
    if (match) headings.push({ level: match[1].length, text: headingText(match[2]), line: index + 1 });
  });
  return headings;
}

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const codePoints = text => [...text].length;

function readNormalized(root, path) {
  return normalizeSourceText(readFileSync(resolve(root, path), 'utf8'));
}

function entryId(collection, slug) {
  return `${collection}.${slug}`;
}

export function buildSourceLibrary({ root = REPO_ROOT, config = SOURCE_CONFIG } = {}) {
  const review = readNormalized(root, QUALITY_REVIEW_PATH);
  const reviewSha256 = sha256(review);
  const documents = [];
  const entries = [];

  for (const doc of config) {
    const text = readNormalized(root, doc.path);
    const lines = splitSourceLines(text);
    const headings = scanSourceHeadings(lines);
    const headingByLine = new Map(headings.map(heading => [heading.line, heading]));

    const starts = doc.sections.map(section => {
      const hits = headings.filter(heading => lines[heading.line - 1].replace(/\n$/, '').trimEnd() === section.heading);
      if (hits.length !== 1) {
        throw new Error(`${doc.path}: boundary heading ${JSON.stringify(section.heading)} matched ${hits.length} lines — update SOURCE_CONFIG`);
      }
      return { ...section, line: hits[0].line };
    });
    starts.forEach((start, index) => {
      if (index > 0 && start.line <= starts[index - 1].line) {
        throw new Error(`${doc.path}: boundary ${JSON.stringify(start.heading)} is out of document order`);
      }
    });

    const first = headingByLine.get(1);
    if (!first || first.level !== 1) throw new Error(`${doc.path}: the first line must be the document's H1 title`);
    const segments = starts[0].line > 1 ? [{ kind: 'preface', slug: 'preface', line: 1 }, ...starts] : starts;

    segments.forEach((segment, index) => {
      const startLine = segment.line;
      const endLine = index + 1 < segments.length ? segments[index + 1].line - 1 : lines.length;
      const markdown = lines.slice(startLine - 1, endLine).join('');
      const opening = headingByLine.get(startLine);
      entries.push({
        id: entryId(doc.collection, segment.slug ?? segment.personId ?? segment.legendId),
        collection: doc.collection,
        kind: segment.kind,
        ...(segment.personId ? { personId: segment.personId } : {}),
        ...(segment.legendId ? { legendId: segment.legendId } : {}),
        name: segment.name ?? null,
        title: opening ? opening.text : lines[startLine - 1].replace(/\n$/, ''),
        docPath: doc.path,
        startLine,
        endLine,
        charCount: codePoints(markdown),
        headings: headings
          .filter(heading => heading.line >= startLine && heading.line <= endLine)
          .map(({ level, text: headingTextValue, line }) => ({ level, text: headingTextValue, line })),
        markdown,
      });
    });

    documents.push({
      collection: doc.collection,
      path: doc.path,
      title: first.text,
      sha256: sha256(text),
      lineCount: lines.length,
      charCount: codePoints(text),
      verification: {
        status: doc.verification.status,
        checked: [...doc.verification.checked],
        unverified: doc.verification.unverified,
        basis: QUALITY_REVIEW_PATH,
        basisSha256: reviewSha256,
      },
    });
  }

  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate source entry id ${entry.id}`);
    ids.add(entry.id);
  }
  const guruPeople = entries.filter(entry => entry.personId).map(entry => entry.personId);
  if (new Set(guruPeople).size !== guruPeople.length) throw new Error('a Guru personId appears in more than one entry');
  return { documents, entries };
}

// JSON is valid ESM once U+2028/9 are escaped. "/", "`" and "'" are escaped too, so that
// line-based source scanners (scripts/no-mock-data.test.mjs strips comments and strings by
// regex) never read Markdown such as "// note" or `code` inside a string as JavaScript.
const ESCAPED_CHARS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029, 0x60, 0x27, 0x2f)}]`, 'g');

function toModuleLiteral(value) {
  return JSON.stringify(value, null, 2)
    .replace(ESCAPED_CHARS, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const HEADER = [
  '// GENERATED by scripts/build-guidance-source-library.mjs — do not edit.',
  '// Regenerate with `npm run guidance:sources`; `npm run check:guidance-sources` fails when stale.',
];

export function renderSourceLibraryModule({ documents, entries }) {
  return [
    ...HEADER,
    '// Verbatim original documents behind the Guru and Legend cards, split into entries.',
    '// Each entry\'s `markdown` is an exact slice of the LF-normalized document.',
    '',
    `export const SOURCE_DOCUMENTS = ${toModuleLiteral(documents)};`,
    '',
    `export const SOURCE_ENTRIES = ${toModuleLiteral(entries)};`,
    '',
  ].join('\n');
}

export function sourcePeopleRoster({ entries }) {
  return entries
    .filter(entry => entry.kind === 'person')
    .map(entry => ({
      entryId: entry.id,
      collection: entry.collection,
      ...(entry.personId ? { personId: entry.personId } : { legendId: entry.legendId }),
      name: entry.name,
      charCount: entry.charCount,
    }));
}

export function renderSourcePeopleModule(library) {
  return [
    ...HEADER,
    '// People and Legends that have original text, without the text itself. The Hub lists',
    '// them statically; the full library is imported lazily only when a reader opens.',
    '',
    `export const SOURCE_PEOPLE = ${toModuleLiteral(sourcePeopleRoster(library))};`,
    '',
  ].join('\n');
}

export function renderOutputs(library) {
  return [
    [LIBRARY_OUTPUT, renderSourceLibraryModule(library)],
    [PEOPLE_OUTPUT, renderSourcePeopleModule(library)],
  ];
}

function summarize(library) {
  const rows = library.documents.map(doc => {
    const docEntries = library.entries.filter(entry => entry.collection === doc.collection);
    const count = kind => docEntries.filter(entry => entry.kind === kind).length;
    return `  ${doc.collection.padEnd(17)} ${String(docEntries.length).padStart(3)} entries (person ${count('person')}, synthesis ${count('synthesis')}, preface ${count('preface')}) · ${doc.charCount.toLocaleString('en-US')} chars · ${doc.lineCount} lines`;
  });
  const total = library.documents.reduce((sum, doc) => sum + doc.charCount, 0);
  return [...rows, `  total             ${String(library.entries.length).padStart(3)} entries · ${total.toLocaleString('en-US')} chars preserved`].join('\n');
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT } = {}) {
  const library = buildSourceLibrary({ root });
  const outputs = renderOutputs(library);
  if (argv.includes('--check')) {
    const stale = outputs.filter(([path, content]) => {
      try {
        return normalizeSourceText(readFileSync(resolve(root, path), 'utf8')) !== content;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(`Guidance source library is stale: ${stale.map(([path]) => path).join(', ')}\nRun \`npm run guidance:sources\` and commit the result.`);
      return 1;
    }
    console.log(`Guidance source library is up to date.\n${summarize(library)}`);
    return 0;
  }
  for (const [path, content] of outputs) writeFileSync(resolve(root, path), content);
  console.log(`Wrote ${outputs.map(([path]) => path).join(', ')}\n${summarize(library)}`);
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  process.exitCode = main();
}
