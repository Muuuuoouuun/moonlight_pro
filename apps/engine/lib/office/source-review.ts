import type { OfficeScope } from '@com-moon/agent-contracts/office';
import { buildOfficeOperatingPolicy } from './operating-policy.ts';

type SourceReviewRequest = { message: string; scope?: OfficeScope; history?: { role: string; text: string }[]; boundedHistory?: { role: string; text: string }[] };
export type OfficeSourceCatalog = readonly { index: number; quote: string }[];

// A source-first editing aid, not independent fact verification. The model must
// anchor its rewrite in verbatim material before producing the public answer.
export const OFFICE_SOURCE_REVIEW_INSTRUCTIONS = `
먼저 sourceIndexes에 sourceCatalog에서 이번 판단을 제한하는 원문 항목의 index를 최대 5개 선택한다. 해당 목록의 정수 index만 쓰며 원문을 다시 쓰거나 sourceQuotes를 출력하지 않는다. 숫자뿐 아니라 '미정/미제공/추정/종료 요청'처럼 답의 범위를 제한하는 구절도 중요하다. 후보 출처는 sourceContext·현재 사용자 원문·이전 사용자 발언·서버가 현재 범위에 제공한 운영자 확정 기준뿐이다. 운영 기준은 업무 원칙의 근거이며 실제 고객·실행·성과의 증거가 아니다. 역할 예시·AI 초안·동료의 주장·검수 지시는 근거로 인용하지 않는다. 관련 후보가 없으면 빈 배열이다. 후보 선택은 관련성이나 주장의 진실을 인증하지 않는다.
그다음 corrections에 AI 초안 또는 동료 의견의 구체적 오류를 짧게 적는다. cause(관측을 원인 확정으로 바꿈), capability(제공·약속·기능 창작), completion(미확인 저장을 성공으로 판정), scope(종결을 업무로 확장), wording(길이·과장·문맥)을 확인한다. 결함이 없으면 빈 배열이며 결함 개수를 채우지 않는다.
이 두 목록은 공개 답변의 근거·교정 메모이며 내부 사고 과정을 설명하는 곳이 아니다. 마지막 공개 답변에는 교정을 실제로 반영한다. 단서나 주의사항을 뒤에 붙이고 앞의 틀린 코드·약속을 그대로 남기지 않는다. 새로운 주장으로 바꿔 끼우지 말고 필요한 사실과 결과만 남긴다. 코드의 성공 계약을 모르면 성공 알림 호출 경로 자체가 없어야 한다. 미확인 기능·자료에 대해 '준비됐다/제공한다/지원 중이다'를 쓰지 않는다. 단순 확인·종결에 새 계획이나 재승인을 붙이지 않는다.
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

function sourceTexts(request: SourceReviewRequest, context: unknown): string[] {
  const source = [request.message, ...sourceStrings(context), ...(request.history || request.boundedHistory || []).filter(turn => turn.role === 'user').map(turn => turn.text)];
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

// Format violations still fail. A cited index that points nowhere (outside the catalog, or at
// text no longer in the sources) is an untraceable citation: drop it and report the check
// state instead of discarding a reviewed answer (2026-09-23 운영자 확정).
export function readSourceReviewedOutput(raw: unknown, request: SourceReviewRequest, context: unknown, catalog: OfficeSourceCatalog): { answer: Record<string, unknown>; sourceCheck: OfficeSourceCheck } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-source-review');
  // This is a private per-call contract, not a persisted public format. Accepting
  // legacy free-text quotes here would bypass the current server catalog.
  if (Object.hasOwn(raw, 'sourceQuotes') || Object.hasOwn(raw, 'sourceCatalog')) throw new Error('invalid-source-review');
  const { sourceIndexes, corrections, ...answer } = raw as Record<string, unknown>;
  const validStrings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= 5 && value.every(item => typeof item === 'string' && item.trim() && item.length <= max && !item.includes('\0'));
  if (!Array.isArray(sourceIndexes) || sourceIndexes.length > 5 || sourceIndexes.some(index => !Number.isSafeInteger(index)) || !validStrings(corrections, 350)) throw new Error('invalid-source-review');
  if (!sourceIndexes.length) return { answer, sourceCheck: 'none' };
  const source = sourceTexts(request, context);
  const traced = sourceIndexes.filter(index => index >= 0 && index < catalog.length && catalog[index].index === index
    && typeof catalog[index].quote === 'string' && catalog[index].quote.trim() !== '' && catalog[index].quote.length <= 300 && source.some(text => text.includes(catalog[index].quote)));
  return { answer, sourceCheck: traced.length ? 'traced' : 'untraced' };
}
