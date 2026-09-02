import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEAD_SUBJECTS,
  SUBJECT_KEY_SET,
  SUBJECT_ORDER,
  absorbSubjectTags,
  buildLabelProposal,
  inferSubjectsFromName,
  subjectLabels,
} from "./lead-labels.js";

test("고정 어휘는 12키, 운영자 승인 순서 그대로", () => {
  assert.deepEqual(LEAD_SUBJECTS.map((s) => s.key), [
    "math", "english", "korean", "science", "social", "essay",
    "coding", "foreign-language", "arts-sports", "elementary-general", "early-childhood", "etc",
  ]);
  assert.deepEqual(LEAD_SUBJECTS.map((s) => s.label), [
    "수학", "영어", "국어", "과학", "사회", "논술",
    "코딩", "외국어", "예체능", "초등종합", "유아", "기타",
  ]);
  assert.equal(SUBJECT_KEY_SET.has("math"), true);
  assert.equal(SUBJECT_ORDER.math < SUBJECT_ORDER.english, true);
});

test("레거시 subject 태그 24종 전수 흡수 (2026-08-19 라이브 실측 분포)", () => {
  const cases = [
    ["subject:math", ["math"]],
    ["subject:english", ["english"]],
    ["subject:korean", ["korean"]],
    ["subject:science", ["science"]],
    ["subject:essay", ["essay"]],
    ["subject:coding", ["coding"]],
    ["subject:elementary-general", ["elementary-general"]],
    ["subject:social_studies", ["social"]],
    ["subject:math-essay", ["math", "essay"]],
    ["subject:ai", ["coding"]],
    ["subject:ict", ["coding"]],
    ["subject:performing-arts", ["arts-sports"]],
    ["subject:music", ["arts-sports"]],
    ["subject:design", ["arts-sports"]],
    ["subject:literacy", ["elementary-general"]],
    ["subject:reading", ["elementary-general"]],
    ["subject:hanja", ["elementary-general"]],
    ["subject:early-childhood-education", ["early-childhood"]],
    ["subject:language", ["foreign-language"]],
    ["subject:engineering", ["etc"]],
    ["subject:civil-engineering", ["etc"]],
    ["subject:maritime", ["etc"]],
    ["subject:christian_education", ["etc"]],
    ["subject:general-secondary", ["etc"]],
  ];
  for (const [tag, expected] of cases) {
    assert.deepEqual(absorbSubjectTags([tag]), expected, tag);
  }
});

test("미등재 레거시 태그는 etc로 흡수(무언 드랍 금지), 중복은 dedupe, 비과목 태그 무시", () => {
  assert.deepEqual(absorbSubjectTags(["subject:zzz-unknown"]), ["etc"]);
  assert.deepEqual(absorbSubjectTags(["subject:ai", "subject:coding", "region:서울"]), ["coding"]);
  assert.deepEqual(absorbSubjectTags([]), []);
});

test("흡수·추론 결과는 어휘 순서로 정렬된다 (정렬 키 결정성)", () => {
  // ai→coding, math → 어휘 순서상 math가 먼저
  assert.deepEqual(absorbSubjectTags(["subject:ai", "subject:math"]), ["math", "coding"]);
  assert.deepEqual(inferSubjectsFromName("브레인 영어수학학원"), ["math", "english"]);
});

test("이름 추론 — 대표 케이스 (라이브 결측 64건 표본)", () => {
  assert.deepEqual(inferSubjectsFromName("온리원수학"), ["math"]);
  assert.deepEqual(inferSubjectsFromName("퍼스트영수"), ["math", "english"]);
  assert.deepEqual(inferSubjectsFromName("더채움영어"), ["english"]);
  assert.deepEqual(inferSubjectsFromName("김쌤 바른 국어"), ["korean"]);
  assert.deepEqual(inferSubjectsFromName("아고라 사탐/한국사"), ["social"]);
  assert.deepEqual(inferSubjectsFromName("일본어 고급반 전문 온라인 수업 교코쌤"), ["foreign-language"]);
  assert.deepEqual(inferSubjectsFromName("엠에스스퀘어 과학학원"), ["science"]);
  assert.deepEqual(inferSubjectsFromName("드림퍼포먼스엔터"), ["arts-sports"]);
  // 학교는 과목 추론 대상이 아니다
  assert.deepEqual(inferSubjectsFromName("삼육초등학교"), []);
  assert.deepEqual(inferSubjectsFromName("부일중"), []);
  // 식별 불가 이름은 빈 배열 (억지 추정 금지)
  assert.deepEqual(inferSubjectsFromName("ㅁㅁ"), []);
  assert.deepEqual(inferSubjectsFromName("재수생"), []);
});

test("subjectLabels — 키 배열을 한국어 라벨로", () => {
  assert.deepEqual(subjectLabels(["math", "essay"]), ["수학", "논술"]);
  assert.deepEqual(subjectLabels(["bogus"]), ["bogus"]); // 미등재는 원문 노출 (숨기지 않음)
});

test("buildLabelProposal — 결측 필드만 제안, 기존 값·태그 폴백은 current로 존중", () => {
  // 이름 추론 성공
  const inferred = buildLabelProposal({ id: "l1", name: "온리원수학", meta: {} });
  assert.deepEqual(inferred.proposedSubjects, ["math"]);
  assert.equal(inferred.subjectsSource, "derived");
  assert.deepEqual(inferred.needsSearch, { subjects: false, region: true });

  // 태그 폴백 보유 → 과목 제안 없음
  const tagged = buildLabelProposal({
    id: "l2", name: "갈무리국어",
    meta: { enrichment: { tags: ["subject:korean", "region:경남-양산"] } },
  });
  assert.deepEqual(tagged.currentSubjects, ["korean"]);
  assert.deepEqual(tagged.proposedSubjects, []);
  assert.equal(tagged.needsSearch.subjects, false);
  assert.equal(tagged.needsSearch.region, false); // region 태그도 보유로 취급

  // 이름으로 안 풀림 → 서치 대상
  const dark = buildLabelProposal({ id: "l3", name: "아띠", meta: {} });
  assert.deepEqual(dark.proposedSubjects, []);
  assert.deepEqual(dark.needsSearch, { subjects: true, region: true });

  // meta.region 보유 → region 서치 불필요
  const hasRegion = buildLabelProposal({ id: "l4", name: "아띠", meta: { region: "서울-강남" } });
  assert.equal(hasRegion.needsSearch.region, false);
  assert.equal(hasRegion.currentRegion, "서울-강남");
});
