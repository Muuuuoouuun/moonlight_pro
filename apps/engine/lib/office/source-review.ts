import type { OfficeScope } from '@com-moon/agent-contracts/office';
import { buildOfficeOperatingPolicy } from './operating-policy.ts';

type SourceReviewRequest = { message: string; scope?: OfficeScope; history?: { role: string; text: string }[]; boundedHistory?: { role: string; text: string }[] };
export type OfficeSourceCatalog = readonly { index: number; quote: string }[];

export const OFFICE_SOURCE_STATE_VERSION = '2026-09-30.source-state-v1';

// Shared by drafting and source review; it requests no private response fields.
export const OFFICE_SOURCE_STATE_INSTRUCTIONS = `[근거 상태 보존 · ${OFFICE_SOURCE_STATE_VERSION}]
원문의 미정·미확인·추정은 그 전제에 의존하는 모든 결론에도 적용한다. 확인된 조건만으로 성립하는 부분과 추가 조건이 필요한 부분을 구분하고, 전제가 미확인인 실행 가능성·우열·효과·약속을 확정하지 않는다. 새 자료로 확인된 조건만 갱신하며 요청·검토·제안·승인·실행·성공은 각각 별도 근거로 구분한다. 일부 조건의 변경으로 나머지 조건까지 확보됐다고 취급하지 않는다. 한계는 근거란에만 적지 말고 해당 본문·고객 초안·추천·다음 행동·반론·판단 변경 조건 자체에 반영한다. 미확인은 불가의 증거도 아니므로 현재 가능한 초안이나 조건부 판단을 제공하고, 요청하지 않은 확인 업무를 만들지 않는다.`;

// A source-first editing aid, not independent fact verification. The model must
// anchor its rewrite in verbatim material before producing the public answer.
export const OFFICE_SOURCE_REVIEW_INSTRUCTIONS = `
먼저 sourceIndexes에 sourceCatalog에서 이번 판단을 제한하는 원문 항목의 index를 최대 5개 선택한다. 해당 목록의 정수 index만 쓰며 원문을 다시 쓰거나 sourceQuotes를 출력하지 않는다. 숫자뿐 아니라 '미정/미제공/추정/종료 요청'처럼 답의 범위를 제한하는 구절도 중요하다. 후보 출처는 sourceContext·현재 사용자 원문·이전 사용자 발언·서버가 현재 범위에 제공한 운영자 확정 기준뿐이다. 운영 기준은 업무 원칙의 근거이며 실제 고객·실행·성과의 증거가 아니다. 역할 예시·AI 초안·동료의 주장·검수 지시는 근거로 인용하지 않는다. 관련 후보가 없으면 빈 배열이다. 후보 선택은 관련성이나 주장의 진실을 인증하지 않는다.
그다음 corrections에 AI 초안 또는 동료 의견의 구체적 오류를 짧게 적는다. cause(관측을 원인 확정으로 바꿈), capability(제공·약속·기능 창작), completion(미확인 저장을 성공으로 판정), scope(종결을 업무로 확장), wording(길이·과장·문맥)을 확인한다. 결함이 없으면 빈 배열이며 결함 개수를 채우지 않는다.
${OFFICE_SOURCE_STATE_INSTRUCTIONS}
이 두 목록은 공개 답변의 근거·교정 메모이며 내부 사고 과정을 설명하는 곳이 아니다. 마지막 공개 답변에는 교정을 실제로 반영한다. 새로운 주장으로 바꿔 끼우지 말고 필요한 사실과 결과만 남긴다. 코드의 성공 계약을 모르면 성공 알림 호출 경로 자체가 없어야 한다. 미확인 기능·자료에 대해 '준비됐다/제공한다/지원 중이다'를 쓰지 않는다. 단순 확인·종결에 새 계획이나 재승인을 붙이지 않는다.
`;

export function buildOfficeSourceCatalog(request: SourceReviewRequest, context: unknown): OfficeSourceCatalog {
  return sourceQuoteCandidates(sourceTexts(request, context)).map((quote, index) => ({ index, quote }));
}

export function officeSourceReviewPrompt(prompt: { systemInstruction: string; prompt: string }, catalog: OfficeSourceCatalog) {
  return { ...prompt, prompt: JSON.stringify({ ...JSON.parse(prompt.prompt), sourceCatalog: catalog }) };
}

export function officeSourceReviewSchema(schema: Record<string, any>, catalog: OfficeSourceCatalog) {
  return { ...schema, properties: {
    sourceIndexes: { type: 'array', maxItems: catalog.length ? 5 : 0, items: { type: 'integer', minimum: 0, ...(catalog.length ? { maximum: catalog.length - 1 } : {}) }, description: '현재 prompt의 sourceCatalog에서 관련 원문 항목의 index 정수만 선택한다. 최대 5개이며 관련 원문이 없으면 빈 배열. 원문이나 별도 인용문을 출력하지 않는다. 출처 일치는 진실·관련성 인증이 아니다.' },
    corrections: { type: 'array', maxItems: 5, items: { type: 'string' }, description: '초안/동료 의견에서 바로잡을 구체 오류와 수정 방향. 항목당 350자 이하. 없으면 빈 배열.' },
    ...schema.properties,
  }, required: ['sourceIndexes', 'corrections', ...schema.required] };
}

function sourceStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(sourceStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(sourceStrings);
  return [];
}

// The free-chat Office context carries machine fields next to the text: source ('provided'),
// scope ('all') and each project's id, status and scope. As catalog entries they let a model mark
// an answer 'traced' by citing a field value (2026-10-01 council test), so only the note and
// project names are source text. Workflow facts keep the generic walk.
function contextStrings(context: unknown): string[] {
  if (context && typeof context === 'object' && !Array.isArray(context) && typeof (context as { source?: unknown }).source === 'string' && Array.isArray((context as { projects?: unknown }).projects)) {
    const { note, projects } = context as { note?: unknown; projects: { name?: unknown }[] };
    return [note, ...projects.map(project => project?.name)].filter((value): value is string => typeof value === 'string');
  }
  return sourceStrings(context);
}

function sourceTexts(request: SourceReviewRequest, context: unknown): string[] {
  const source = [request.message, ...contextStrings(context), ...(request.history || request.boundedHistory || []).filter(turn => turn.role === 'user').map(turn => turn.text)];
  // The catalog and final validator share exactly this source boundary.
  // Do not widen it to persona examples, drafts or caller-supplied policy strings.
  if (request.scope === 'classin' || request.scope === 'personal' || request.scope === 'all') source.push(buildOfficeOperatingPolicy(request.scope));
  return source;
}

function sourceQuoteCandidates(source: string[]): string[] {
  const candidates = new Set<string>();
  const add = (quote: string) => { if (quote.trim()) candidates.add(quote); };
  for (const text of source) {
    // NUL cannot be quoted by the existing validator. Preserve the text around it.
    for (const section of text.split('\0')) {
      let chunk = '';
      // Keep line endings so adjacent short lines remain an exact source substring.
      for (const match of section.matchAll(/[^\r\n\u2028\u2029]*(?:\r\n|[\r\n\u2028\u2029]|$)/gu)) {
        const line = match[0];
        if (chunk.length + line.length <= 300) { chunk += line; continue; }
        add(chunk); chunk = '';
        if (line.length <= 300) { chunk = line; continue; }
        // Only long lines split within a line; never split a surrogate pair or CRLF.
        for (const unit of line.matchAll(/\r\n|[\s\S]/gu)) {
          if (chunk.length + unit[0].length > 300) { add(chunk); chunk = ''; }
          chunk += unit[0];
        }
      }
      add(chunk);
    }
  }
  return [...candidates];
}

export type OfficeSourceCheck = 'traced' | 'none' | 'untraced';
export type OfficeSourceCounts = { selected: number; traced: number; untraced: number };

// Format violations still fail. A cited index that points nowhere (outside the catalog, or at
// text no longer in the sources) is an untraceable citation: drop it and report the check
// state instead of discarding a reviewed answer (2026-09-23 운영자 확정).
export function readSourceReviewedOutput(raw: unknown, request: SourceReviewRequest, context: unknown, catalog: OfficeSourceCatalog): { answer: Record<string, unknown>; corrections: string[]; sourceCheck: OfficeSourceCheck; sourceCounts: OfficeSourceCounts } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-source-review');
  // This is a private per-call contract, not a persisted public format. Accepting
  // legacy free-text quotes here would bypass the current server catalog.
  if (Object.hasOwn(raw, 'sourceQuotes') || Object.hasOwn(raw, 'sourceCatalog')) throw new Error('invalid-source-review');
  const { sourceIndexes, corrections, ...answer } = raw as Record<string, unknown>;
  const validStrings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= 5 && value.every(item => typeof item === 'string' && item.trim() && item.length <= max && !item.includes('\0'));
  if (!Array.isArray(sourceIndexes) || sourceIndexes.length > 5 || sourceIndexes.some(index => !Number.isSafeInteger(index)) || !validStrings(corrections, 350)) throw new Error('invalid-source-review');
  const selected = [...new Set(sourceIndexes as number[])];
  // Retain the public editing notes for the next synthesis call, separately from
  // the answer. Validation establishes format only, not that a critique is true.
  const review = { answer, corrections: [...corrections] };
  if (!selected.length) return { ...review, sourceCheck: 'none', sourceCounts: { selected: 0, traced: 0, untraced: 0 } };
  const source = sourceTexts(request, context);
  const traced = selected.filter(index => index >= 0 && index < catalog.length && catalog[index].index === index
    && typeof catalog[index].quote === 'string' && catalog[index].quote.trim() !== '' && catalog[index].quote.length <= 300 && source.some(text => text.includes(catalog[index].quote)));
  return { ...review, sourceCheck: traced.length ? 'traced' : 'untraced', sourceCounts: { selected: selected.length, traced: traced.length, untraced: selected.length - traced.length } };
}
