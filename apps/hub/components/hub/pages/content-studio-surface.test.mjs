// Studio 기본 화면 예산 — docs/superpowers/specs/2026-09-23-studio-simplification.md §3.
// 새 기능이 올 때마다 본문에 패널이 붙어 화면이 무거워졌다(2026-09-12 → 09-22 사이 7종 추가).
// 기본 화면은 "Threads 글 한 편 끝내기"만 담고, 나머지는 '더보기' 드로어로 간다.
// 예산을 늘려야 한다면 이 테스트가 아니라 스펙 §3을 먼저 고친다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const studio = await readFile(new URL("./content-studio.jsx", import.meta.url), "utf8");
const ai = await readFile(new URL("./content-studio-ai.jsx", import.meta.url), "utf8");
const editors = await readFile(new URL("./content-studio-editors.jsx", import.meta.url), "utf8");

const between = (source, start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing marker: ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `missing end marker: ${end}`);
  return source.slice(from, to);
};
const count = (source, pattern) => (source.match(pattern) || []).length;
const CONTROLS = /<(Button|TextField|TextAreaField|SelectField|Checkbox|SegmentedControl)\b/g;

test("Studio header keeps only 새 글 + 더보기 (plus a save retry that appears on failure)", () => {
  const header = between(studio, '<header className="studio-page-header">', "</header>");
  assert.equal(count(header, /<Button\b/g), 3, "header buttons: 저장 재시도(실패 시) · 새 글 · 더보기");
  assert.match(header, /더보기/);
  assert.doesNotMatch(header, /버전 저장|버전 기록/, "버전 관련 동작은 더보기 드로어에 둔다");
});

test("Studio main surface stays within its control budget", () => {
  const main = between(studio, '<section className="studio-main"', "</section>");
  // 제목 · 원문 메모 · (채널 2개 이상일 때) 결과물 전환 · 복사 · 발행했음
  assert.ok(count(main, CONTROLS) <= 5, `main surface controls ${count(main, CONTROLS)} > 5`);
  for (const moved of ["GoalLinks", "JournalSources", "BRIEF_FIELDS", "BLOCKERS", "다음 행동", "검수 게이트", "내보내기"]) {
    assert.ok(!main.includes(moved), `${moved} belongs in the 더보기 drawer, not the main surface`);
  }
  assert.doesNotMatch(studio, /<aside\b/, "Studio has no side panel — secondary tools live in the 더보기 drawer");
});

test("Studio AI exposes exactly two direct actions; the rest is folded", () => {
  const surface = between(ai, 'return <div className="studio-ai"', '<details className="studio-ai-more">');
  assert.equal(count(surface, /<Button\b/g), 2, "AI 초안 · AI 다듬기");
  assert.equal(count(surface, /<SelectField\b/g), 0, "작업·말투 선택은 '다른 작업' 안에 접는다");
});

test("Studio drops the writing-focus toggle, variant title field, and celebration effects", () => {
  assert.doesNotMatch(editors, /글쓰기 집중|writingFocus/);
  assert.doesNotMatch(editors, /결과물 제목/);
  assert.doesNotMatch(studio, /triggerCelebration|triggerSparkleAt/);
});
