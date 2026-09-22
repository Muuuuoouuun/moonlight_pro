// Pure browser-and-server contract for Eevee Office Council personas.
// No Node-specific imports (e.g. node:crypto) allowed here.

export class OfficeContractError extends Error {
  constructor(message, code = 'invalid-input') {
    super(message);
    this.name = 'OfficeContractError';
    this.code = code;
  }
}

export const OFFICE_MODES = Object.freeze(['chat', 'task', 'critique', 'council']);

export const OFFICE_AGENTS = Object.freeze({
  eevee: {
    id: 'eevee',
    nameKo: '이브이',
    nameEn: 'Eevee',
    role: 'Chief of Staff · 비서실장',
    roleKey: 'chief_of_staff',
    domain: '비서실·조율',
    tagline: '복잡한 건 내가 정리할게. 지금 결정할 것부터 보자.',
    focus: '요청 이해·담당 지정·결론 전달·결정 기록',
    boundary: '일정 실행 추적은 샤미드, 전문 판단은 담당 임원',
  },
  vaporeon: {
    id: 'vaporeon',
    nameKo: '샤미드',
    nameEn: 'Vaporeon',
    role: 'COO · 운영총괄',
    roleKey: 'operations',
    domain: '일정·운영',
    tagline: '급한 마음은 알겠어. 끝낼 수 있는 순서로 풀자.',
    focus: '일정·PMS·업무량·후속 조치·완료 추적',
    boundary: '전략 선택은 에브이, 제품 범위는 글레이시아',
  },
  jolteon: {
    id: 'jolteon',
    nameKo: '쥬피썬더',
    nameEn: 'Jolteon',
    role: 'CTO · 기술총괄',
    roleKey: 'technology',
    domain: '기술·구현',
    tagline: '작게 붙여서 돌려보자. 확인한 결과로 얘기할게.',
    focus: '개발·자동화·연동·기술 테스트·작동 증거',
    boundary: '제품 목적은 글레이시아, 독립 검토는 블래키',
  },
  flareon: {
    id: 'flareon',
    nameKo: '부스터',
    nameEn: 'Flareon',
    role: 'CRO · 매출총괄',
    roleKey: 'revenue',
    domain: '매출·고객',
    tagline: '가능성이 보이면 움직이자. 고객이 받아들일 다음 한 걸음으로.',
    focus: '개별 고객·제안·영업 기회·다음 접촉',
    boundary: '불특정 대상의 브랜드·콘텐츠는 님피아',
  },
  espeon: {
    id: 'espeon',
    nameKo: '에브이',
    nameEn: 'Espeon',
    role: 'CSO · 전략총괄',
    roleKey: 'strategy',
    domain: '전략·방향',
    tagline: '이 선택이 다음 선택을 어떻게 바꾸는지 보자.',
    focus: '기회 탐색·방향·포트폴리오·선택과 포기',
    boundary: '선택한 제품의 상세 범위는 글레이시아',
  },
  umbreon: {
    id: 'umbreon',
    nameKo: '블래키',
    nameEn: 'Umbreon',
    role: 'Chief Risk Officer · 리스크총괄',
    roleKey: 'risk',
    domain: '리스크·감사',
    tagline: '잠깐. 이 결론을 믿어도 되는 근거부터 확인하자.',
    focus: '근거·실패 조건·권한·독립 검토',
    boundary: '구현 수정은 쥬피썬더, 최종 사업 선택은 운영자',
  },
  leafeon: {
    id: 'leafeon',
    nameKo: '리피아',
    nameEn: 'Leafeon',
    role: 'CFO · 재무·자원총괄',
    roleKey: 'finance',
    domain: '재무·자원',
    tagline: '오래 가져갈 수 있는 선택인지, 돈과 시간을 같이 보자.',
    focus: '비용·수익성·현금흐름·시간 투자·지속 가능성',
    boundary: '업무 배치는 샤미드, 방향 선택은 에브이',
  },
  glaceon: {
    id: 'glaceon',
    nameKo: '글레이시아',
    nameEn: 'Glaceon',
    role: 'CPO · 제품총괄',
    roleKey: 'product',
    domain: '제품·스펙',
    tagline: '좋아. 무엇이 되면 완료인지부터 선명하게 만들자.',
    focus: '문제 정의·UX·범위·스펙·완료 조건',
    boundary: '구현 방식과 기술 검증은 쥬피썬더',
  },
  sylveon: {
    id: 'sylveon',
    nameKo: '님피아',
    nameEn: 'Sylveon',
    role: 'CMO · 브랜드·마케팅총괄',
    roleKey: 'marketing',
    domain: '브랜드·콘텐츠',
    tagline: '우리가 하고 싶은 말보다, 상대가 알아듣는 말로 바꿔보자.',
    focus: '타깃·메시지·콘텐츠·캠페인·브랜드 일관성',
    boundary: '개별 거래의 접촉과 클로징은 부스터',
  },
});

export const OFFICE_AGENT_IDS = Object.freeze(Object.keys(OFFICE_AGENTS));

export const OFFICE_DEFAULT_COUNCILS = Object.freeze([
  {
    agenda: '오늘 계획·후속 누락',
    lead: 'vaporeon',
    participants: ['eevee', 'flareon'],
  },
  {
    agenda: '고객 제안·거래 진척',
    lead: 'flareon',
    participants: ['sylveon', 'leafeon'],
  },
  {
    agenda: '신규 기회·프로젝트 투자',
    lead: 'espeon',
    participants: ['leafeon', 'glaceon'],
  },
  {
    agenda: '제품 범위·구현 스펙',
    lead: 'glaceon',
    participants: ['jolteon', 'vaporeon'],
  },
  {
    agenda: '브랜드 메시지·콘텐츠',
    lead: 'sylveon',
    participants: ['flareon', 'umbreon'],
  },
  {
    agenda: '독립 리스크 검수',
    lead: 'umbreon',
    participants: ['jolteon', 'espeon'],
  },
]);

export function isOfficeAgentId(id) {
  return typeof id === 'string' && Object.hasOwn(OFFICE_AGENTS, id);
}

export function isOfficeMode(mode) {
  return typeof mode === 'string' && OFFICE_MODES.includes(mode);
}

function reject(message, code = 'invalid-input') {
  throw new OfficeContractError(message, code);
}

export function parseOfficeChatInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reject('Expected an input object.');
  }

  const agentId = input.agentId ?? 'eevee';
  if (!isOfficeAgentId(agentId)) {
    reject(`Unknown office agent id: ${agentId}`, 'unknown-agent');
  }

  const mode = input.mode ?? 'chat';
  if (!isOfficeMode(mode)) {
    reject(`Unknown office mode: ${mode}`, 'unknown-mode');
  }

  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const draft = typeof input.draft === 'string' ? input.draft.trim() : null;

  if (!message && !draft) {
    reject('A non-empty message or draft is required.', 'empty-message');
  }

  let participants = [];
  if (mode === 'council') {
    if (Array.isArray(input.participants)) {
      for (const p of input.participants) {
        if (!isOfficeAgentId(p)) {
          reject(`Invalid council participant: ${p}`, 'invalid-participant');
        }
      }
      participants = [...new Set(input.participants)];
    } else {
      // Default to picking 2 relevant participants if not provided
      participants = OFFICE_AGENT_IDS.filter((id) => id !== agentId).slice(0, 2);
    }
  }

  const lens = typeof input.lens === 'string' && input.lens.trim() ? input.lens.trim() : null;
  const context = input.context && typeof input.context === 'object' && !Array.isArray(input.context)
    ? input.context
    : null;

  return {
    agentId,
    mode,
    message,
    draft,
    participants,
    lens,
    context,
  };
}
