// 리드 과목·지역 라벨의 단일 정본 (2026-08-19 spec §1~3).
// - LEAD_SUBJECTS: 12키 고정 어휘. 목록 순서 = 정렬 순서.
// - absorbSubjectTags: 레거시 enrichment `subject:*` 태그(24종 드리프트)를 12키로 흡수.
// - inferSubjectsFromName: 백필 1단계 이름 추론 (derived).
// - buildLabelProposal: propose 스크립트가 행별로 쓰는 제안 빌더 (읽기 전용).
// meta.enrichment.*는 파이프라인 소유라 여기서 절대 쓰지 않는다 — 읽기 흡수만.

export const LEAD_SUBJECTS = [
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
  { key: "korean", label: "국어" },
  { key: "science", label: "과학" },
  { key: "social", label: "사회" },
  { key: "essay", label: "논술" },
  { key: "coding", label: "코딩" },
  { key: "foreign-language", label: "외국어" },
  { key: "arts-sports", label: "예체능" },
  { key: "elementary-general", label: "초등종합" },
  { key: "early-childhood", label: "유아" },
  { key: "etc", label: "기타" },
];

export const SUBJECT_KEY_SET = new Set(LEAD_SUBJECTS.map((s) => s.key));
export const SUBJECT_ORDER = Object.fromEntries(LEAD_SUBJECTS.map((s, i) => [s.key, i]));
const SUBJECT_LABEL = Object.fromEntries(LEAD_SUBJECTS.map((s) => [s.key, s.label]));

// 레거시 subject:* 값 → 12키 (spec §2, 2026-08-19 라이브 24종 전수).
const LEGACY_SUBJECT_MAP = {
  math: ["math"],
  english: ["english"],
  korean: ["korean"],
  science: ["science"],
  essay: ["essay"],
  coding: ["coding"],
  "elementary-general": ["elementary-general"],
  social_studies: ["social"],
  "math-essay": ["math", "essay"],
  ai: ["coding"],
  ict: ["coding"],
  "performing-arts": ["arts-sports"],
  music: ["arts-sports"],
  design: ["arts-sports"],
  literacy: ["elementary-general"],
  reading: ["elementary-general"],
  hanja: ["elementary-general"],
  "early-childhood-education": ["early-childhood"],
  language: ["foreign-language"],
  engineering: ["etc"],
  "civil-engineering": ["etc"],
  maritime: ["etc"],
  christian_education: ["etc"],
  "general-secondary": ["etc"],
};

const warnedUnmapped = new Set(); // mapLead 핫패스(117행×요청)에서 경고는 키당 1회만

function sortByVocab(keys) {
  return [...new Set(keys)].sort((a, b) => (SUBJECT_ORDER[a] ?? 99) - (SUBJECT_ORDER[b] ?? 99));
}

export function subjectLabels(keys = []) {
  return (Array.isArray(keys) ? keys : []).map((k) => SUBJECT_LABEL[k] || String(k));
}

export function absorbSubjectTags(tags = []) {
  const out = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw);
    if (!tag.startsWith("subject:")) continue;
    const legacy = tag.slice("subject:".length);
    const mapped = LEGACY_SUBJECT_MAP[legacy];
    if (mapped) {
      out.push(...mapped);
    } else {
      // 미등재 값은 etc로 흡수 — 조용한 드랍 금지 (spec §2)
      out.push("etc");
      if (!warnedUnmapped.has(legacy)) {
        warnedUnmapped.add(legacy);
        console.warn(`[lead-labels] unmapped subject tag "${legacy}" absorbed to etc`);
      }
    }
  }
  return sortByVocab(out);
}

// 백필 1단계: 이름에서 과목 추론 (spec §3-1). 확신 규칙만 — 애매하면 빈 배열.
// 학교(초·중·고·대)는 학원이 아니므로 추론 제외. 매칭되는 규칙은 전부 합친다(영어수학학원 = 둘 다).
const SCHOOL_RE = /(초등학교|중학교|고등학교|대학교|초교|여중|여고)$|중$/;
const NAME_RULES = [
  { re: /영수(?![가-힣])|영수학원|영수전문/, keys: ["english", "math"] },
  { re: /수학|수리|매쓰|매스|math/i, keys: ["math"] },
  { re: /외국어학원/, keys: ["foreign-language"] },
  { re: /일본어|중국어|일어|중어|스페인어|프랑스어|불어|독일어/, keys: ["foreign-language"] },
  { re: /영어|잉글리|english|리딩타운|어학원/i, keys: ["english"] },
  { re: /국어/, keys: ["korean"] },
  { re: /논술|글쓰기/, keys: ["essay"] },
  { re: /과학|사이언스|물리|화학|생명과학/, keys: ["science"] },
  { re: /사탐|한국사|역사|사회탐구/, keys: ["social"] },
  { re: /코딩|프로그래밍|로봇|소프트웨어|SW교육/i, keys: ["coding"] },
  { re: /미술|음악|피아노|보컬|댄스|무용|발레|연기|퍼포먼스|체대|태권도/, keys: ["arts-sports"] },
  { re: /독서|문해력/, keys: ["elementary-general"] },
  { re: /유치원|유아|키즈/, keys: ["early-childhood"] },
];

export function inferSubjectsFromName(name) {
  const text = String(name || "").trim();
  if (!text || SCHOOL_RE.test(text)) return [];
  const out = [];
  for (const rule of NAME_RULES) {
    if (rule.re.test(text)) out.push(...rule.keys);
  }
  return sortByVocab(out);
}

function tagValue(tags, prefix) {
  const hit = (Array.isArray(tags) ? tags : []).find((t) => String(t).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : "";
}

// propose 스크립트용 행별 제안 (읽기 전용 — 쓰기는 apply 스크립트만).
// 결측 필드에만 제안을 만들고, 이름으로도 안 풀린 필드는 needsSearch로 표시한다.
export function buildLabelProposal(row = {}) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const tags = Array.isArray(meta.enrichment?.tags) ? meta.enrichment.tags.map(String) : [];
  const currentSubjects = Array.isArray(meta.subjects) && meta.subjects.length
    ? meta.subjects.map(String).filter((k) => SUBJECT_KEY_SET.has(k))
    : absorbSubjectTags(tags);
  const currentRegion = String(meta.region || tagValue(tags, "region:") || "").trim();
  const inferred = currentSubjects.length ? [] : inferSubjectsFromName(row.name);
  return {
    id: row.id,
    name: String(row.name || ""),
    currentSubjects,
    currentRegion,
    proposedSubjects: inferred,
    subjectsSource: inferred.length ? "derived" : null,
    proposedRegion: null, // 네이버 조사 단계에서 채움 (searched)
    regionSource: null,
    needsSearch: {
      subjects: currentSubjects.length === 0 && inferred.length === 0,
      region: !currentRegion,
    },
  };
}
