// 웹 보강 정보 — companies.meta.enrichment_web(네이버·다음·웹 검색으로 채운 공개 정보)를
// 고객 상세가 읽기만 하는 표시 모델로 바꾼다. 쓰기 경로는 없다(편집은 이 화면의 일이 아니다).
// 키는 찾은 것만 들어 있으므로 빈 값은 버리고, 링크는 http(s)만 남긴다 — 외부에서 모은
// 문자열을 그대로 href에 꽂지 않는다(javascript: 등 차단).

const CONFIDENCE_LABEL = { high: '신뢰도 높음', medium: '신뢰도 중간', low: '신뢰도 낮음' };
// CertaintyBadge 상태로만 표현한다 — 신뢰도를 성공/경고 색으로 칠하지 않는다(DESIGN.md §5.2).
const CONFIDENCE_CERTAINTY = { high: 'confirmed', medium: 'recommended', low: 'unknown' };
const MATCH_STATUS_LABEL = { found: '확인', partial: '일부 확인' };
const BRAND_TYPE_LABEL = {
  local: '로컬',
  franchise: '프랜차이즈',
  online_mega: '인강 메가',
  mega: '인강 메가',
  university: '대학',
  school: '학교',
};

const text = (value) => (typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : ''));

export function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// 링크 목록 — 문자열 하나·배열 모두 받고, 안전한 http(s)만 중복 없이 남긴다.
export function safeUrlList(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const href = safeHttpUrl(item);
    if (href && !seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
  }
  return out;
}

export function telHref(phone) {
  const digits = text(phone).replace(/[^0-9+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

export function naverMapHref(address) {
  const value = text(address);
  return value ? `https://map.naver.com/p/search/${encodeURIComponent(value)}` : null;
}

// 링크 글자 — 프로토콜·끝 슬래시를 떼어 짧게 보인다.
export function linkLabel(href) {
  try {
    const url = new URL(href);
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return decodeURIComponent(`${url.host.replace(/^www\./, '')}${path}`);
  } catch {
    return href;
  }
}

// company: companies 행({ website, meta }) — enrichment_web이 없으면 null(섹션을 통째로 숨긴다).
export function webEnrichmentView(company) {
  const raw = company?.meta?.enrichment_web;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const address = text(raw.address);
  const region = [text(raw.region_sido), text(raw.region_sigungu), text(raw.dong)].filter(Boolean).join(' ');
  const phone = text(raw.phone);
  const confidence = text(raw.confidence).toLowerCase();
  const matchStatus = text(raw.match_status || raw.status).toLowerCase();
  const brandType = text(raw.brand_type);
  const subjects = text(raw.subjects);
  const targetGrades = text(raw.target_grades);
  const website = safeHttpUrl(company?.website);
  const links = safeUrlList([website, raw.website, ...(Array.isArray(raw.blog_or_sns) ? raw.blog_or_sns : [raw.blog_or_sns])]);

  const view = {
    address,
    mapHref: naverMapHref(address),
    area: text(raw.building_or_area),
    region,
    phone,
    phoneHref: telHref(phone),
    links,
    subjectsLine: [subjects, targetGrades].filter(Boolean).join(' · '),
    sizeNote: text(raw.size_note),
    brandType: brandType ? (BRAND_TYPE_LABEL[brandType] || brandType) : '',
    avSignal: text(raw.av_signal),
    sources: safeUrlList(raw.source_urls),
    matchedName: text(raw.matched_name),
    note: text(raw.note || raw.notes),
    confidence: CONFIDENCE_LABEL[confidence] ? confidence : '',
    confidenceLabel: CONFIDENCE_LABEL[confidence] || '',
    confidenceCertainty: CONFIDENCE_CERTAINTY[confidence] || 'unknown',
    matchStatusLabel: MATCH_STATUS_LABEL[matchStatus] || '',
    researchedAt: text(raw.researched_at).slice(0, 10),
  };

  const hasContent = Boolean(
    view.address || view.area || view.region || view.phone || view.links.length || view.subjectsLine
    || view.sizeNote || view.brandType || view.avSignal || view.sources.length || view.note,
  );
  return hasContent ? view : null;
}
