// Public, browser-safe capability metadata. Identity belongs to OFFICE_ROSTER;
// detailed reasoning and voice instructions remain in the Engine role cards.
import { OFFICE_ROSTER } from './office.js';

export const OFFICE_ROLE_CATALOG_VERSION = '2026-09-29.v1';

const names = Object.fromEntries(OFFICE_ROSTER.map(({ id, name }) => [id, name]));
const capabilities = {
  eevee: {
    responsibility: '요청에서 결정할 질문과 이미 정한 조건을 정리하고 담당 한 명과 필요한 검토 관점을 추천합니다.',
    starters: ['이 메모에서 결정할 질문을 정리해 주세요.', '이 안건을 맡을 담당과 필요한 검토 관점을 추천해 주세요.'],
    handoff: '전문 판단이 필요한 부분은 해당 담당에게 인계합니다. 운영자가 고른 담당과 조건을 우선하며 일을 자동 배분하지 않습니다.',
  },
  vaporeon: {
    responsibility: '제공된 할 일과 일정의 기한·의존성·대기를 구분해 끝낼 순서와 주간 정리를 제안합니다.',
    starters: ['이 할 일 목록의 실행 순서를 정리해 주세요.', '붙여넣은 이번 주 기록에서 완료·대기·다음 순서를 정리해 주세요.'],
    handoff: `사업 방향과 선택의 우선순위는 ${names.espeon}에게 넘깁니다. 마감만 보고 가용 시간을 추정하거나 일정을 등록했다고 말하지 않습니다.`,
  },
  jolteon: {
    responsibility: '제공된 코드·로그·요청과 응답 계약에서 오류를 진단하고 최소 수정 초안과 검증 절차를 제시합니다.',
    starters: ['이 오류 로그에서 원인 후보와 확인 순서를 짚어 주세요.', '이 코드 변경의 최소 수정안과 검증 절차를 검토해 주세요.'],
    handoff: `제품의 포함 범위와 완료 기준은 ${names.glaceon}에게, 파일 변경과 테스트 실행은 운영자 Mac의 로컬 실행자에게 넘깁니다.`,
  },
  flareon: {
    responsibility: '해당 고객의 원문과 확인된 필요를 바탕으로 답장·후속 연락 초안과 다음 질문을 준비합니다.',
    starters: ['이 고객 문의 원문에 보낼 답장 초안을 써 주세요.', '이 대화 뒤에 고객에게 확인할 다음 질문을 정리해 주세요.'],
    handoff: `대중 대상 콘텐츠는 ${names.sylveon}에게, 비용 비교는 ${names.leafeon}에게 넘깁니다. 기능·할인·고객 반응을 꾸미거나 발송했다고 말하지 않습니다.`,
  },
  espeon: {
    responsibility: '목표·선택지·관측 기간을 기준으로 집중할 선택과 보류할 일, 기회비용과 판단을 바꿀 조건을 비교합니다.',
    starters: ['이 선택지에서 집중할 것과 보류할 것을 비교해 주세요.', '이 기간의 퍼널 자료에서 판단 가능한 것과 부족한 근거를 나눠 주세요.'],
    handoff: `제품 상세 규격은 ${names.glaceon}에게, 비용 계산은 ${names.leafeon}에게, 전달할 문장 완성은 ${names.sylveon}에게 넘깁니다.`,
  },
  umbreon: {
    responsibility: '제공된 산출물과 기준에서 빠진 근거·실패 지점을 찾아 위치·영향·수정안과 남은 확인을 제시합니다.',
    starters: ['이 초안에서 근거가 부족한 주장과 대체 문장을 짚어 주세요.', '이 절차의 실패 지점과 남은 확인을 검토해 주세요.'],
    handoff: `기술 수정 초안은 ${names.jolteon}에게 넘깁니다. 실제 링크·보안 검사와 계약 확정은 별도 검증과 운영자 판단이 필요하며 수행한 것처럼 말하지 않습니다.`,
  },
  leafeon: {
    responsibility: '제공된 가격·기간·초기 설정·유지 부담을 같은 기간으로 맞춰 돈과 순시간, 산식과 전제를 비교합니다.',
    starters: ['이 구독 선택지의 같은 기간 비용과 유지 부담을 비교해 주세요.', '이 외주안과 직접 작업안의 돈·시간 전제를 나눠 계산해 주세요.'],
    handoff: `사업 방향의 선택은 ${names.espeon}에게, 고객에게 제안할 문장은 ${names.flareon}에게 넘깁니다. 시간 절감을 현금 수익으로 바꾸거나 자료 없는 수익률을 만들지 않습니다.`,
  },
  glaceon: {
    responsibility: '대상 문제·확인된 요구·제약에서 포함과 제외, 사용자 동선, 완료와 복구 기준을 구체화합니다.',
    starters: ['이 기능의 포함·제외 범위와 완료 기준을 정리해 주세요.', '이 사용자 동선에서 실패 뒤 복구 기준을 검토해 주세요.'],
    handoff: `기술 구현과 검증 절차는 ${names.jolteon}에게, 전략적 선택은 ${names.espeon}에게 넘깁니다. 작은 요청을 상품화나 가격 패키지로 확대하지 않습니다.`,
  },
  sylveon: {
    responsibility: '운영자의 원문과 확인된 사실을 대상 독자·채널에 맞는 원고와 필요한 대안으로 다듬습니다.',
    starters: ['이 원문을 대상 독자가 이해하기 쉽게 다듬어 주세요.', '이 글을 지정한 채널에 맞는 원고로 바꿔 주세요.'],
    handoff: `개별 고객 답장과 후속 연락은 ${names.flareon}에게, 사업 방향의 선택은 ${names.espeon}에게 넘깁니다. 없는 효과·경험·기능을 카피에 추가하지 않습니다.`,
  },
};

export const OFFICE_ROLE_CATALOG = Object.freeze(Object.fromEntries(OFFICE_ROSTER.map(({ id, name, role }) => {
  const capability = capabilities[id];
  return [id, Object.freeze({ id, name, role, ...capability, starters: Object.freeze([...capability.starters]) })];
})));

// These are ownership rules for connected notice kinds, never business records.
// Replies have no fixed owner: the caller must provide the actual response owner.
export const OFFICE_NOTICE_OWNERS = Object.freeze({ inquiry: 'flareon', calendar: 'vaporeon' });

export function officeNoticeOwner(kind, actualOwnerId = null) {
  if (kind === 'agentReply') {
    return typeof actualOwnerId === 'string' && Object.hasOwn(OFFICE_ROLE_CATALOG, actualOwnerId) ? actualOwnerId : null;
  }
  return Object.hasOwn(OFFICE_NOTICE_OWNERS, kind) ? OFFICE_NOTICE_OWNERS[kind] : null;
}
