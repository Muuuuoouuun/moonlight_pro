// Studio 기본 화면 예산 — docs/superpowers/specs/2026-11-02-studio-desk-threads-publish.md §3
// (2026-09-23 Studio 단순화 §3을 대체: 원고 책상 여백 칸 두 개와 올리기 창, 운영자 확정 2026-11-02).
// 새 기능이 올 때마다 본문에 패널이 붙어 화면이 무거워졌다(2026-09-12 → 09-22 사이 7종 추가).
// 원고지는 "글 한 편 쓰고 올리기"만 담고, 나머지는 '더보기' 드로어나 올리기 창으로 간다.
// 예산을 늘려야 한다면 이 테스트가 아니라 스펙 §3을 먼저 고친다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const studio = await readFile(new URL("./content-studio.jsx", import.meta.url), "utf8");
const ai = await readFile(new URL("./content-studio-ai.jsx", import.meta.url), "utf8");
const editors = await readFile(new URL("./content-studio-editors.jsx", import.meta.url), "utf8");
const desk = await readFile(new URL("./content-studio-desk.jsx", import.meta.url), "utf8");

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

test("Studio paper stays within its control budget and keeps one primary action", () => {
  const main = between(studio, '<section className="studio-main', "</section>");
  // 브랜드 · 형식 탭 · 제목 · 원문 메모 · 복사 · 예약 · 올리기 — 결과물 전환은 왼쪽 여백, 발행했음은 올리기 창(직접 올리기)으로 갔다.
  assert.ok(count(main, CONTROLS) <= 7, `paper controls ${count(main, CONTROLS)} > 7`);
  assert.equal(count(main, /variant="primary"/g), 1, "원고지의 주 행동은 올리기 하나");
  assert.match(main, /올리기<\/Button>/);
  assert.doesNotMatch(main, /발행했음/, "발행 기록은 올리기 창의 직접 올리기에서");
  for (const moved of ["GoalLinks", "JournalSources", "BRIEF_FIELDS", "BLOCKERS", "다음 행동", "검수 게이트", "내보내기"]) {
    assert.ok(!main.includes(moved), `${moved} belongs in the 더보기 drawer, not the main surface`);
  }
  assert.doesNotMatch(studio, /<aside\b/, "여백 칸은 원고 책상 구성 요소가 그린다");
});

test("Studio margins: the outline only navigates and the assist margin holds no form fields", () => {
  const outline = between(desk, "export function StudioOutline", "\n}\n");
  assert.equal(count(outline, CONTROLS), 0, "왼쪽 여백은 목차 · 결과물 · 기록 이동 버튼뿐");
  const assist = between(desk, "export function StudioAssist", "\n}\n");
  assert.equal(count(assist, CONTROLS), 0, "오른쪽 여백은 읽기만");
  assert.doesNotMatch(assist, /<(input|textarea|select)\b/);
  assert.match(assist, /<aside className="studio-assist" aria-label="도움">/);
});

test("Studio format tabs are one SegmentedControl in the paper head, defaulting to the channel list of 3", () => {
  assert.equal(count(studio, /<SegmentedControl\b/g), 1, "형식 탭 하나");
  const head = between(studio, '<div className="studio-paper__head">', '<div className="studio-paper__body">');
  assert.match(head, /<SegmentedControl label="형식"/, "형식 탭은 브랜드와 함께 원고지 머리에");
  assert.match(head, /올릴 브랜드/, "브랜드 = 올릴 계정, 원고지 맨 위에서 고른다");
  assert.match(studio, /FORMAT_TABS = \[[^\]]*threads[^\]]*instagram[^\]]*youtube_shorts/);
});

test("Studio AI exposes at most three direct actions (초안 · 다듬기 · 형식별 1개); request, templates and other operations are folded", () => {
  const row = between(ai, '<div className="studio-actions studio-ai-actions">', "</div>\n      {!draft.brandId");
  assert.equal(count(row, /<Button\b/g), 3, "AI 초안 · AI 다듬기 · 첫 줄 3안(스레드만)");
  assert.equal(count(row, /<(SelectField|TextField|TextAreaField)\b/g), 0);
  // 요청문·템플릿·기타 작업은 접힌 <details> 안에만 있다.
  const request = between(ai, '<details className="studio-ai-request">', "</details>");
  assert.match(request, /label="템플릿"/);
  assert.match(request, /label="AI에게 부탁할 것"/);
  assert.ok(ai.indexOf('label="작업"') > ai.indexOf('<details className="studio-ai-more">'), "작업 선택은 '다른 작업' 안에 접는다");
});

test("Studio drops the writing-focus toggle, variant title field, and celebration effects", () => {
  assert.doesNotMatch(editors, /글쓰기 집중|writingFocus/);
  assert.doesNotMatch(editors, /결과물 제목/);
  assert.doesNotMatch(studio, /triggerCelebration|triggerSparkleAt/);
});
