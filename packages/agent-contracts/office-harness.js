// Browser-safe Office harness contract: how one agenda is split into work packets.
// Draft (2026-10-01, 권장 — docs/superpowers/specs/2026-10-01-office-harness-work-breakdown-design.md).
// It grants nothing: a breakdown is a recommendation the operator applies, and every
// packet still runs only when the operator presses its button.
import { OFFICE_IDS, OFFICE_SCOPES, OfficeInputError } from './office.js';

export const OFFICE_HARNESS_VERSION = '2026-10-01.v1-draft';
export const OFFICE_BREAKDOWN_LIMITS = Object.freeze({ agenda: 6000, packets: 5, inputs: 4, holds: 3, questions: 2, reviewers: 2, packetMessage: 6000, priorResult: 1500, resultBytes: 16000 });

// Work kind → the role that owns it and the answer mode it opens with.
// The model picks a kind; the harness assigns owner and mode, so the split stays
// deterministic. Owners mirror the deep design §4·§5 tables (2026-09-21).
export const OFFICE_WORK_KINDS = Object.freeze({
  schedule_plan: Object.freeze({ ownerId: 'vaporeon', mode: 'draft', label: '실행 순서' }),
  weekly_summary: Object.freeze({ ownerId: 'vaporeon', mode: 'draft', label: '주간 정리' }),
  customer_contact: Object.freeze({ ownerId: 'flareon', mode: 'draft', label: '고객 연락' }),
  content_draft: Object.freeze({ ownerId: 'sylveon', mode: 'draft', label: '원고' }),
  scope_definition: Object.freeze({ ownerId: 'glaceon', mode: 'draft', label: '완료 기준' }),
  tech_diagnosis: Object.freeze({ ownerId: 'jolteon', mode: 'review', label: '기술 진단' }),
  cost_compare: Object.freeze({ ownerId: 'leafeon', mode: 'review', label: '돈·시간 비교' }),
  direction_choice: Object.freeze({ ownerId: 'espeon', mode: 'chat', label: '방향 선택' }),
  risk_review: Object.freeze({ ownerId: 'umbreon', mode: 'review', label: '근거·약속 검토' }),
});
export const OFFICE_WORK_KIND_IDS = Object.freeze(Object.keys(OFFICE_WORK_KINDS));

// Who each role may ask for a second view. Copied from the role-card handoffs (v25);
// the Engine test pins the copy to the cards. 블래키 can review any role's packet.
export const OFFICE_HANDOFFS = Object.freeze({
  eevee: Object.freeze(['vaporeon', 'espeon']),
  vaporeon: Object.freeze(['glaceon', 'flareon']),
  jolteon: Object.freeze(['glaceon', 'umbreon']),
  flareon: Object.freeze(['leafeon', 'umbreon']),
  espeon: Object.freeze(['leafeon', 'glaceon']),
  umbreon: Object.freeze(['jolteon', 'flareon', 'eevee']),
  leafeon: Object.freeze(['espeon', 'jolteon']),
  glaceon: Object.freeze(['jolteon', 'vaporeon', 'flareon', 'umbreon']),
  sylveon: Object.freeze(['flareon', 'umbreon', 'glaceon']),
});
export function officeReviewerCandidates(ownerId) {
  return OFFICE_HANDOFFS[ownerId] ? [...new Set([...OFFICE_HANDOFFS[ownerId], 'umbreon'])].filter(id => id !== ownerId) : [];
}

// Where a finished packet leaves Office. None of them runs by itself.
// office: open it as an Office request · task: a step the operator does (linked through the
// existing confirm-to-task path) · skill_request: a local Claude Code/Codex run on the Mac.
export const OFFICE_PACKET_EXITS = Object.freeze(['office', 'task', 'skill_request']);
export const OFFICE_PACKET_STATES = Object.freeze(['waiting', 'ready', 'done', 'skipped']);

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
const exactKeys = (value, expected, message) => check(plain(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), message);
function text(value, max, message) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0'), message);
  return value.trim();
}
function texts(value, count, max, message) {
  check(Array.isArray(value) && value.length <= count, message);
  return value.map(item => text(item, max, message));
}
const byteLength = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function parseOfficeBreakdownRequest(value) {
  exactKeys(value, ['message', 'scope'], '업무 나누기 요청 형식을 확인해 주세요.');
  check(OFFICE_SCOPES.includes(value.scope), '지원하지 않는 업무 범위입니다.');
  return { message: text(value.message, OFFICE_BREAKDOWN_LIMITS.agenda, '안건 길이를 확인해 주세요.'), scope: value.scope };
}

const PROPOSAL_PACKET_KEYS = ['key', 'kind', 'scope', 'ask', 'inputs', 'deliverable', 'doneWhen', 'dependsOn', 'reviewerIds', 'exit'];

function parsePacket(value, index, seen, request, assigned) {
  const keys = assigned ? [...PROPOSAL_PACKET_KEYS, 'ownerId', 'mode', 'ownerSource'] : PROPOSAL_PACKET_KEYS;
  exactKeys(value, keys, '업무 조각 형식을 확인해 주세요.');
  check(value.key === `p${index + 1}`, '업무 조각은 p1부터 순서대로 번호를 붙입니다.');
  check(OFFICE_WORK_KIND_IDS.includes(value.kind), '지원하지 않는 업무 종류입니다.');
  check(['classin', 'personal'].includes(value.scope) && (request.scope === 'all' || value.scope === request.scope), '업무 조각은 회사 또는 개인 중 안건 범위 안에서 하나를 고릅니다.');
  const kind = OFFICE_WORK_KINDS[value.kind];
  let ownerId = kind.ownerId, mode = kind.mode, ownerSource = 'kind';
  if (assigned) {
    check(['kind', 'operator'].includes(value.ownerSource) && OFFICE_IDS.includes(value.ownerId) && value.mode === kind.mode, '업무 조각의 담당 배정을 확인해 주세요.');
    check(value.ownerSource === 'operator' || value.ownerId === kind.ownerId, '추천 단계의 담당은 업무 종류가 정합니다.');
    ({ ownerId, ownerSource } = value);
  }
  check(Array.isArray(value.dependsOn) && new Set(value.dependsOn).size === value.dependsOn.length && value.dependsOn.every(key => seen.has(key)), '선행 조각은 앞에 나온 조각만 가리킬 수 있습니다.');
  check(Array.isArray(value.reviewerIds) && value.reviewerIds.length <= OFFICE_BREAKDOWN_LIMITS.reviewers && new Set(value.reviewerIds).size === value.reviewerIds.length, '검토 관점은 최대 두 명입니다.');
  const candidates = ownerSource === 'operator' ? OFFICE_IDS.filter(id => id !== ownerId) : officeReviewerCandidates(ownerId);
  check(value.reviewerIds.every(id => candidates.includes(id)), '검토 관점은 담당이 인계하는 역할이나 블래키여야 합니다.');
  check(OFFICE_PACKET_EXITS.includes(value.exit), '업무 조각의 다음 연결을 확인해 주세요.');
  return {
    key: value.key, kind: value.kind, scope: value.scope, ownerId, mode, ownerSource,
    ask: text(value.ask, 600, '조각의 요청을 확인해 주세요.'),
    inputs: texts(value.inputs, OFFICE_BREAKDOWN_LIMITS.inputs, 200, '필요 자료는 네 항목까지입니다.'),
    deliverable: text(value.deliverable, 300, '납품물을 확인해 주세요.'),
    doneWhen: text(value.doneWhen, 300, '완료 조건을 확인해 주세요.'),
    dependsOn: [...value.dependsOn], reviewerIds: [...value.reviewerIds], exit: value.exit,
  };
}

function parseBreakdownBody(value, request, assigned) {
  check(Array.isArray(value.packets) && value.packets.length >= 1 && value.packets.length <= OFFICE_BREAKDOWN_LIMITS.packets, '업무 조각은 한 개에서 다섯 개입니다.');
  const seen = new Set();
  const packets = value.packets.map((packet, index) => {
    const parsed = parsePacket(packet, index, seen, request, assigned);
    seen.add(parsed.key);
    return parsed;
  });
  const result = {
    summary: text(value.summary, 400, '안건 요약을 확인해 주세요.'),
    decisionNeeded: value.decisionNeeded === null ? null : text(value.decisionNeeded, 300, '운영자가 정할 것을 확인해 주세요.'),
    packets,
    holds: texts(value.holds, OFFICE_BREAKDOWN_LIMITS.holds, 200, '보류 항목은 세 개까지입니다.'),
    questions: texts(value.questions, OFFICE_BREAKDOWN_LIMITS.questions, 200, '확인 질문은 두 개까지입니다.'),
  };
  check(byteLength(result) <= OFFICE_BREAKDOWN_LIMITS.resultBytes, '업무 나누기 결과가 너무 큽니다.');
  return result;
}

// Model output. It names kinds only — an ownerId from the model is rejected.
export function parseOfficeBreakdownProposal(value, request) {
  exactKeys(value, ['summary', 'decisionNeeded', 'packets', 'holds', 'questions'], '업무 나누기 형식을 확인해 주세요.');
  return { scope: request.scope, ...parseBreakdownBody(value, request, false) };
}

// Engine → Hub transport. Owners must still be the kind defaults: no one has applied it yet.
export function parseOfficeBreakdownResult(value, request) {
  exactKeys(value, ['status', 'version', 'scope', 'summary', 'decisionNeeded', 'packets', 'holds', 'questions'], '업무 나누기 형식을 확인해 주세요.');
  check(value.status === 'recommended' && value.version === OFFICE_HARNESS_VERSION && value.scope === request.scope, '업무 나누기 계약 버전 또는 범위가 일치하지 않습니다.');
  const body = parseBreakdownBody(value, request, true);
  check(body.packets.every(packet => packet.ownerSource === 'kind'), '추천 단계의 담당은 업무 종류가 정합니다.');
  return { status: 'recommended', version: OFFICE_HARNESS_VERSION, scope: value.scope, ...body };
}

export function officeBreakdownResult(proposal) {
  return { status: 'recommended', version: OFFICE_HARNESS_VERSION, ...proposal };
}

// Operator override: the explicit choice beats the kind default (deep design §5 순서).
export function withOfficePacketOwner(breakdown, key, ownerId) {
  check(OFFICE_IDS.includes(ownerId), '등록되지 않은 Office 담당입니다.');
  check(breakdown.packets.some(packet => packet.key === key), '없는 업무 조각입니다.');
  return { ...breakdown, packets: breakdown.packets.map(packet => packet.key !== key ? packet : { ...packet, ownerId, ownerSource: 'operator', reviewerIds: packet.reviewerIds.filter(id => id !== ownerId) }) };
}

// Packet states come from what the operator marked, never from elapsed time or model output.
export function officePacketStates(breakdown, marks = {}) {
  check(plain(marks) && Object.entries(marks).every(([key, state]) => breakdown.packets.some(packet => packet.key === key) && ['done', 'skipped'].includes(state)), '업무 조각 상태를 확인해 주세요.');
  return Object.fromEntries(breakdown.packets.map(packet => {
    if (marks[packet.key]) return [packet.key, marks[packet.key]];
    const blocked = packet.dependsOn.some(key => marks[key] !== 'done');
    return [packet.key, blocked ? 'waiting' : 'ready'];
  }));
}

function clip(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// Builds the body of one Office request for a ready packet. Prior results are the operator's
// copies of finished upstream packets, labelled as such and clipped — never fetched here.
export function officePacketRequest(breakdown, key, { agenda, priorResults = {}, withReviewers = false } = {}) {
  const packet = breakdown.packets.find(item => item.key === key);
  check(Boolean(packet), '없는 업무 조각입니다.');
  check(typeof agenda === 'string' && agenda.trim().length > 0, '원래 안건이 필요합니다.');
  check(plain(priorResults) && Object.keys(priorResults).every(prior => packet.dependsOn.includes(prior) && typeof priorResults[prior] === 'string'), '앞선 조각 결과는 선행 조각만 넣을 수 있습니다.');
  const council = withReviewers && packet.reviewerIds.length > 0;
  const head = [
    `[업무 조각 ${packet.key} · ${OFFICE_WORK_KINDS[packet.kind].label}]`,
    `요청: ${packet.ask}`,
    packet.inputs.length ? `필요 자료: ${packet.inputs.join(' / ')}` : '',
    `납품물: ${packet.deliverable}`,
    `완료 조건: ${packet.doneWhen}`,
    ...packet.dependsOn.filter(prior => priorResults[prior]?.trim()).map(prior => `[앞선 조각 ${prior} 결과 · 운영자가 붙여 넣은 사본]\n${clip(priorResults[prior].trim(), OFFICE_BREAKDOWN_LIMITS.priorResult)}`),
  ].filter(Boolean).join('\n');
  const room = OFFICE_BREAKDOWN_LIMITS.packetMessage - head.length - 20;
  check(room > 200, '앞선 결과가 너무 깁니다. 줄여서 붙여 넣어 주세요.');
  const message = `${head}\n\n[원래 안건]\n${clip(agenda.trim(), room)}`;
  return {
    ownerId: packet.ownerId,
    mode: council ? 'council' : packet.mode,
    scope: packet.scope,
    message,
    participants: council ? [packet.ownerId, ...packet.reviewerIds] : [],
  };
}
