// Browser regression suite against controlled API responses. Never writes to the live ledger.
// Start the Hub, then run with HUB_QA_URL and PLAYWRIGHT_MODULE (if not installed locally).
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  let mode = 'live';
  let failSave = false;
  let conflictSave = false;
  let duplicateSave = false;
  let releaseSave;
  let saveGate;
  let readGate;
  let releaseRead;
  let delayedDate;
  const records = new Map();
  const posts = [];
  await page.route('**/api/hub/daily-review**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const date = new URL(request.url()).searchParams.get('date') || '2026-09-12';
      if (readGate && date === delayedDate) await readGate;
      return route.fulfill({ json: { status: mode, configured: mode !== 'preview', timezone: 'Asia/Seoul', reviewDate: date, month: date.slice(0, 7), review: records.get(date) || null, entries: [...records.values()].filter(r => r.reviewDate.startsWith(date.slice(0, 7))) } });
    }
    const input = request.postDataJSON();
    posts.push(input);
    if (saveGate) await saveGate;
    if (failSave) return route.fulfill({ status: 502, json: { status: 'error', message: '저장 연결을 확인하고 다시 시도해 주세요.' } });
    if (conflictSave) {
      conflictSave = false;
      const current = { ...records.get(input.reviewDate), revision: records.get(input.reviewDate).revision + 1, note: '다른 창의 메모' };
      records.set(input.reviewDate, current);
      return route.fulfill({ status: 409, json: { status: 'conflict', review: current } });
    }
    const previous = records.get(input.reviewDate);
    assert.equal(input.expectedRevision, previous?.revision || 0);
    const saved = { id: previous?.id || `review-${input.reviewDate}`, reviewDate: input.reviewDate, timezone: 'Asia/Seoul', energy: input.energy, focus: input.focus, progress: input.progress, note: input.note, revision: (previous?.revision || 0) + 1, updatedAt: new Date().toISOString() };
    records.set(saved.reviewDate, saved);
    return route.fulfill({ json: { status: duplicateSave ? 'duplicate' : 'saved', review: saved } });
  });
  const app = process.env.HUB_QA_URL || 'http://localhost:3114/dashboard/work/daily-review';
  const dialog = page.getByRole('dialog', { name: '하루 리뷰', exact: true });
  const ready = () => page.getByText('저장소 연결됨', { exact: true }).waitFor();
  const energy = n => dialog.getByRole('group', { name: '에너지, 1 많이 지침부터 5 활기참까지' }).getByRole('button', { name: String(n), exact: true });
  const note = () => dialog.getByLabel('한 줄 메모', { exact: true });
  const disclosure = () => dialog.getByRole('button', { name: /목표·진척도 남기기/ });
  const open = async () => {
    await page.locator('.daily-review-open').click(); await note().waitFor();
    await page.waitForFunction(() => document.getElementById('daily-review-composer') === document.activeElement);
  };
  const close = async () => { await dialog.getByRole('button', { name: '닫기', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); };
  const save = async (label = '수정 저장') => {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('저장했어요. 날짜별 기록에서 다시 열 수 있어요.', { exact: true }).waitFor();
  };
  try {
    await page.goto(app); await ready();
    assert.equal(await page.locator('h2').count(), 1);
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.locator('textarea').count(), 0);
    await open();
    assert.equal(await dialog.getByLabel('오늘의 목표', { exact: true }).isVisible(), false);
    assert.equal(await dialog.getByRole('button', { name: '저장', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: '닫기', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await disclosure().evaluate(el => el === document.activeElement), true, 'empty composer wraps focus to the last visible enabled action');
    await energy(2).click(); await energy(2).click();
    assert.equal(await energy(2).getAttribute('aria-pressed'), 'false');
    await energy(2).click();
    await dialog.getByRole('button', { name: '저장', exact: true }).focus(); await page.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button', { name: '닫기', exact: true }).evaluate(el => el === document.activeElement), true);
    await save('저장'); assert.equal(records.get('2026-09-12').energy, 2);
    checks.push('basic popup, optional fields hidden, toggle, keyboard focus trap, energy-only save');

    await open(); await note().fill('닫았다 다시 이어 쓸 메모'); await close();
    assert.equal(await page.locator('.daily-review-open').evaluate(el => el === document.activeElement), true);
    await open(); assert.equal(await note().inputValue(), '닫았다 다시 이어 쓸 메모');
    await page.locator('.hub-drawer-overlay').click({ position: { x: 5, y: 5 } }); await dialog.waitFor({ state: 'hidden' });
    await open(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.reload(); await ready(); await open();
    assert.equal(await note().inputValue(), '닫았다 다시 이어 쓸 메모');
    await disclosure().click();
    await dialog.getByRole('button', { name: '미착수', exact: true }).click();
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await dialog.getByText('진척을 평가할 오늘의 목표를 입력해 주세요.', { exact: true }).waitFor();
    await dialog.getByLabel('오늘의 목표', { exact: true }).fill('개요 소제목 3개 쓰기');
    await save(); assert.equal(records.get('2026-09-12').progress, 0);
    await open(); assert.equal(await disclosure().getAttribute('aria-expanded'), 'true');
    await disclosure().click(); await note().fill('목표를 접어도 값은 유지'); await save();
    assert.equal(records.get('2026-09-12').progress, 0);
    await open(); await dialog.getByRole('button', { name: '평가할 목표 없음', exact: true }).click(); await save();
    assert.equal(records.get('2026-09-12').progress, 'not_applicable');
    checks.push('close/reopen and refresh restore draft, zero validation, saved progress expands, collapsing preserves answers, no target');

    await open(); await note().fill('실패해도 남아야 할 내 메모'); failSave = true;
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await dialog.getByRole('button', { name: '다시 저장', exact: true }).waitFor();
    assert.equal(await note().inputValue(), '실패해도 남아야 할 내 메모');
    const retryKey = posts.at(-1).requestId;
    failSave = false; duplicateSave = true; await save('다시 저장'); duplicateSave = false;
    assert.equal(posts.at(-1).requestId, retryKey);
    await open(); await note().fill('내가 작성한 메모'); conflictSave = true;
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await dialog.getByText('현재 저장된 내용 보기', { exact: true }).click();
    await dialog.getByText('다른 창의 메모', { exact: true }).waitFor();
    assert.equal(await note().inputValue(), '내가 작성한 메모');
    await save('내 입력으로 다시 저장'); assert.equal(records.get('2026-09-12').note, '내가 작성한 메모');
    await open(); await note().fill('충돌 시 저장된 기록으로 돌아가기'); conflictSave = true;
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await dialog.getByRole('button', { name: '저장된 기록 사용', exact: true }).click();
    assert.equal(await note().inputValue(), '다른 창의 메모');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'adopting a conflicting record retains focus');
    assert.equal(await disclosure().getAttribute('aria-expanded'), 'true');
    await close();
    checks.push('failure retains popup and input, stable retry receipt, duplicate acknowledgement, conflict comparison and explicit overwrite');

    await open(); await note().fill('저장이 끝날 때까지 기다리기');
    saveGate = new Promise(resolve => { releaseSave = resolve; });
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await dialog.getByRole('button', { name: '저장 중…', exact: true }).waitFor();
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'saving retains focus in the dialog');
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Tab cannot leave while saving');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.locator('.hub-drawer-overlay').click({ position: { x: 5, y: 5 } });
    assert.equal(await dialog.isVisible(), true);
    releaseSave(); saveGate = null; await dialog.waitFor({ state: 'hidden' });
    await open(); await note().fill('날짜 이동 전 미저장 메모'); await close();
    await page.getByRole('button', { name: '이전 날', exact: true }).click(); await ready(); await open();
    assert.equal(await note().inputValue(), '');
    await note().fill('어제의 기록'); await save('저장');
    await page.getByRole('button', { name: '2026-09-12 기록 열기', exact: true }).click(); await note().waitFor();
    assert.equal(await note().inputValue(), '날짜 이동 전 미저장 메모');
    await close();
    delayedDate = '2026-09-11'; readGate = new Promise(resolve => { releaseRead = resolve; });
    await page.getByRole('button', { name: '2026-09-11 기록 열기', exact: true }).click();
    await dialog.getByText('기록을 불러오고 있어요…', { exact: true }).waitFor();
    await page.waitForFunction(() => document.getElementById('daily-review-composer') === document.activeElement);
    assert.equal(await dialog.locator('textarea').count(), 0, 'previous date answers are hidden while loading');
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Tab cannot leave while a record is loading');
    await close(); releaseRead(); readGate = null; await ready(); await open();
    assert.equal(await note().inputValue(), '어제의 기록'); await close();
    await page.getByRole('button', { name: '2026-09-12 기록 열기', exact: true }).click(); await note().waitFor();
    checks.push('saving blocks dismiss, day-specific drafts, note-only save, history opens chosen date');

    await close(); await page.emulateMedia({ reducedMotion: 'no-preference' }); await open();
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'hubCompactIn');
    await dialog.getByRole('button', { name: '닫기', exact: true }).evaluate(el => el.click());
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.dataset.exiting === 'true');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'hubCompactOut');
    await dialog.waitFor({ state: 'hidden' });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await open();
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'none');
    await disclosure().click();
    await page.screenshot({ path: '/tmp/moonlight-review-popup-desktop.png', animations: 'disabled' });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const rect = await dialog.boundingBox();
      assert.ok(Math.abs(rect.x) <= 1 && Math.abs(rect.width - width) <= 1 && Math.abs(rect.y + rect.height - 844) <= 1);
      assert.equal(await note().evaluate(el => getComputedStyle(el).fontSize), '16px');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `/tmp/moonlight-review-popup-${width}.png`, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 430 });
    await disclosure().click();
    const footer = await page.locator('.daily-review-composer-footer').boundingBox();
    assert.ok(footer.y >= 0 && footer.y + footer.height <= 430, 'save stays visible in a short viewport');
    await dialog.getByLabel('오늘의 목표', { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await dialog.getByLabel('오늘의 목표', { exact: true }).isVisible());
    checks.push('enter/exit animation, reduced motion, 390px/320px bottom sheet, short viewport with scrollable form and visible save');

    await close(); await page.setViewportSize({ width: 1440, height: 1000 });
    mode = 'preview'; await page.reload();
    await page.getByText('저장소 연결이 필요해요. 입력은 이 창에 보관됩니다.', { exact: true }).waitFor(); await open();
    await note().fill('연결 전 임시 입력');
    assert.equal(await dialog.getByRole('button', { name: '저장', exact: true }).isDisabled(), true);
    mode = 'error'; await dialog.getByRole('button', { name: '다시 불러오기', exact: true }).click();
    await dialog.getByText('기록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.', { exact: true }).waitFor();
    assert.equal(await note().inputValue(), '연결 전 임시 입력');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'refresh retains focus');
    await close(); await open(); assert.equal(await note().inputValue(), '연결 전 임시 입력');
    checks.push('preview never saves, read error retains input, disconnected close/reopen');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', checks, posts: posts.length, consoleErrors: errors }, null, 2));
  } catch (error) {
    await page.screenshot({ path: '/tmp/moonlight-review-popup-failure.png' }).catch(() => {});
    console.error('Console errors:', errors);
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
