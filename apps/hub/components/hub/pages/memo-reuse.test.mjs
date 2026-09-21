import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { selectedNoteExcerpt } from "../../../lib/journal-client.js";

// 2026-09-20 캡처 마찰 정리. 운영자가 2.0 실사용 1순위로 "메모·콘텐츠 아이디어 캡처"를
// 지목했는데, 적은 메모를 할 일·콘텐츠로 잇는 경로에 두 개의 숨은 필수 단계가 있었다:
// (1) 본문을 드래그해 발췌를 고르지 않으면 활용 버튼이 계속 비활성, (2) 제목이 항상 빈 칸.
// 두 단계를 없애되 무엇이 전달되는지는 계속 눈에 보이게 한다(버튼 라벨 · 확인 드로어 미리보기).
const composer = await readFile(new URL("./memo-composer.jsx", import.meta.url), "utf8");
const useComposer = await readFile(new URL("./memo-use-composer.jsx", import.meta.url), "utf8");
const studio = await readFile(new URL("./content-studio.jsx", import.meta.url), "utf8");
const quickMemo = await readFile(new URL("../quick-memo.jsx", import.meta.url), "utf8");

test("메모 전체 발췌는 원문을 그대로 재구성한다 (journal_note_command_v1 selection-changed 계약)", () => {
  const body = "  첫 관찰\n😀 같은 말 / 같은 말  ";
  const whole = selectedNoteExcerpt(body, 0, body.length);
  assert.ok(whole, "본문 전체는 유효한 발췌여야 한다");
  assert.equal(whole.prefix + whole.text + whole.suffix, body, "RPC는 원문과 정확히 같을 때만 저장한다");
  assert.equal(whole.text, body);
  // 라이브러리 계약은 그대로다 — 빈 범위와 3,500자 초과는 여전히 발췌가 아니다.
  assert.equal(selectedNoteExcerpt(body, 0, 0), null);
  assert.equal(selectedNoteExcerpt("x".repeat(3501), 0, 3501), null);
  assert.equal(selectedNoteExcerpt("   ", 0, 3), null);
});

test("발췌를 고르지 않아도 메모 전체로 할 일·콘텐츠를 만들 수 있다", () => {
  assert.match(composer, /const wholeMemo = React\.useMemo\(\(\) => selectedNoteExcerpt\(draft\?\.body \|\| '', 0, \(draft\?\.body \|\| ''\)\.length\)/);
  assert.match(composer, /const useExcerpt = selection \|\| wholeMemo;/);
  assert.match(composer, /const canUse = Boolean\(entry && !dirty && !locked && source === 'live' && useExcerpt\);/);
  // 저장 안 된 편집본은 여전히 보낼 수 없다 — 원문·버전 보존 계약.
  assert.doesNotMatch(composer, /prepareUse\('create_(task|content)', selection\)/, "활용 버튼은 useExcerpt를 넘긴다");
  assert.match(composer, /prepareUse\('create_task', useExcerpt\)/);
  assert.match(composer, /prepareUse\('create_content', useExcerpt\)/);
});

test("무엇이 전달되는지 라벨과 안내로 밝힌다 (조용한 전체 전송 금지)", () => {
  assert.match(composer, /selection \? '발췌를 할 일로' : '메모 전체를 할 일로'/);
  assert.match(composer, /selection \? '발췌를 콘텐츠로' : '메모 전체를 콘텐츠로'/);
  assert.match(composer, /메모 전체를 보내거나, 일부만 쓰려면 위에서 문장을 선택하세요/);
  // 3,500자를 넘으면 전체 전송이 불가능하므로 그 사실을 직접 알린다.
  assert.match(composer, /메모가 길어요\. 보낼 문장을 3,500자 이내로 선택해 주세요\./);
});

test("메모 드로어는 본문에서 손을 떼지 않고 저장한다 (IME 안전)", () => {
  const start = composer.indexOf("function saveShortcut(");
  assert.ok(start >= 0, "saveShortcut 핸들러가 있어야 한다");
  const body = composer.slice(start, composer.indexOf("\n  }", start));
  assert.match(body, /event\.key !== 'Enter' \|\| !\(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(body, /isComposing \|\| event\.keyCode === 229/, "한글 조합 중 Enter는 저장이 아니다");
  assert.match(body, /!canSave/, "저장 버튼과 같은 조건으로만 발동한다");
  assert.match(composer, /className="memo-composer memo-stack" onKeyDown=\{saveShortcut\}/);
  assert.match(composer, /disabled=\{!canSave\}/, "푸터 버튼과 단축키는 같은 canSave를 쓴다");
  assert.match(composer, /'메모 저장'\} <Kbd>⌘↵<\/Kbd><\/Button>/, "단축키는 실행 버튼 옆 Kbd 한 칸으로 알린다 (§8.1)");
});

test("활용 드로어는 발췌 첫 줄을 제목으로 제안하고 ⌘Enter로 끝낸다", () => {
  assert.match(useComposer, /reuseDraft\.selection\?\.text \|\| ''\)\.split\('\\n'\)\.map\(\(line\) => line\.trim\(\)\)\.find\(Boolean\)/);
  assert.match(useComposer, /\.slice\(0, 200\)/, "제목은 서버 한도(200자)를 넘기지 않는다");
  assert.match(useComposer, /reuseDraft\.target\.title\.trim\(\) \? '' :/, "이미 제목이 있으면 덮어쓰지 않는다");
  assert.match(useComposer, /if \(seeded\.current \|\| !suggestion\) return;/, "제안은 열릴 때 한 번만 — 지운 제목을 되살리지 않는다");
  assert.match(useComposer, /hint=\{suggestion && reuseDraft\.target\.title === suggestion \? '발췌 첫 줄로 채웠어요/);
  const start = useComposer.indexOf("function submitShortcut(");
  assert.ok(start >= 0, "submitShortcut 핸들러가 있어야 한다");
  const body = useComposer.slice(start, useComposer.indexOf("\n  }", start));
  assert.match(body, /isComposing \|\| event\.keyCode === 229 \|\| !canSubmit/);
  assert.match(useComposer, /disabled=\{!canSubmit\}/);
});

test("M 키로 어디서든 빠른 메모를 연다 (입력 중·다른 대화상자에서는 양보)", () => {
  const start = quickMemo.indexOf('if (event.key !== "m"');
  assert.ok(start >= 0, "M 단축키 핸들러가 있어야 한다");
  const handler = quickMemo.slice(start, start + 700);
  assert.match(handler, /event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| event\.repeat/);
  assert.match(handler, /event\.isComposing \|\| event\.keyCode === 229/);
  assert.match(handler, /tagName === "INPUT" \|\| target\?\.tagName === "TEXTAREA" \|\| target\?\.tagName === "SELECT" \|\| target\?\.isContentEditable/);
  assert.match(quickMemo, /if \(shown \|\| unavailable\) return;\n    const onKey = event => \{\n      if \(event\.key !== "m"/, "팔레트·다른 대화상자가 떠 있으면 등록하지 않는다");
  assert.match(quickMemo, /title="빠른 메모 · M"/, "런처가 단축키를 알린다");
  assert.match(quickMemo, /aria-label=\{`빠른 메모 · 단축키 M/);
});

test("메모·스튜디오 로딩은 스켈레톤으로 레이아웃을 예고한다 (DESIGN.md §11)", () => {
  assert.match(composer, /!ready \? <Skeleton lines=\{4\}/);
  assert.doesNotMatch(composer, /메모를 불러오고 있어요/, "맨 문구 한 줄로 되돌리는 것은 회귀다");
  assert.match(studio, /!studio\.ready \? <Card className="studio-stack"><Skeleton/);
  assert.doesNotMatch(studio, /원문과 결과물을 불러오는 중입니다/);
  for (const [name, source] of [["memo-composer", composer], ["content-studio", studio]]) {
    // Skeleton은 로딩 전용 — preview/error를 스켈레톤으로 그리지 않는다.
    assert.doesNotMatch(source, /\{(studio\.loadError|model\.loadError)[^}]{0,40}<Skeleton/, `${name}: 오류 상태에 Skeleton 금지`);
  }
});

test("이번에 만진 화면은 토큰만 쓰고 raw ms·cubic-bezier를 넣지 않는다", () => {
  for (const [name, source] of [["memo-composer", composer], ["memo-use-composer", useComposer], ["quick-memo", quickMemo]]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/, `${name}: 하드코딩 색상 금지`);
    assert.doesNotMatch(source, /\b\d+ms\b|cubic-bezier\(/, `${name}: 모션은 §9 토큰만`);
  }
});
