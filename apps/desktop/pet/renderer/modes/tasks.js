// 할 일 — 빠른 추가(Enter), 행 전체 눌러 완료(저장 확인 후 3초 유예·재클릭 취소), 완료 포함 보기, 우클릭 메뉴.
// 저장은 허브가 확인한다. 실패·로그인 필요·Preview 는 빈 목록이 아니라 이유와 함께 보여 준다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.tasks = {
    create(ctx) {
      const { C, B, U, M } = ctx;
      const T = M.tasks;
      const E = M.envelope;
      const h = U.h;

      let tasks = [];
      let view = null; // 마지막 읽기 결과(describeRead)
      let loading = false;
      let loadedAt = null;
      let includeCompleted = false;
      let saving = false;
      let draftId = null;
      let inputNote = null; // { text, danger, action }
      const busy = new Set();
      let alive = true;

      const grace = T.createGrace({ onChange: () => alive && renderList() });

      const input = h('input', {
        type: 'text', placeholder: '새 할 일', 'aria-label': '새 할 일', maxlength: String(T.MAX_TITLE + 200), autocomplete: 'off', spellcheck: 'false',
      });
      const send = U.action(null, { compact: true, icon: 'arrowUp', iconSize: 14, ariaLabel: '할 일 추가', title: '할 일 추가 · Enter', onClick: () => add() });
      const field = h('div', { class: 'field' }, U.icon('plus', 15), input, send);
      const note = h('div', { class: 'inline-note', role: 'status', hidden: true });
      const countText = h('span', { class: 'grow num' });
      const viewBtn = U.quiet('목록 보기', { menu: true, title: '할 일 목록 보기 설정', onClick: () => openViewMenu() });
      const metaRow = h('div', { class: 'meta-row' }, countText, viewBtn);
      const scroll = h('div', { class: 'scroll' });
      const listWrap = h('div', { class: 'list-wrap' }, metaRow, scroll);
      const status = h('span', { class: 'status' });
      const footer = h('div', { class: 'footer' }, status,
        U.quiet('Hub에서 열기', { icon: 'arrowUpRight', iconSize: 12, iconAfter: true, onClick: () => ctx.openHub(C.HUB_PATHS.tasks) }));
      let lastDraftTitle = '';
      const el = h('section', { class: 'mode tasks', 'aria-label': '할 일' }, field, note, listWrap, footer);

      // 입력 초안: 매 입력마다 로컬 보관(요청 ID 포함 — 불확실한 저장을 같은 ID 로 다시 확인).
      input.addEventListener('input', () => {
        if (draftId && input.value.trim() !== lastDraftTitle) draftId = null;
        B.store.set('petPreview.taskDraft', input.value ? { title: input.value, id: draftId } : null);
        updateSend();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) { e.preventDefault(); add(); }
      });
      B.store.get('petPreview.taskDraft').then((d) => {
        if (!alive || !d || typeof d !== 'object' || input.value) return;
        input.value = typeof d.title === 'string' ? d.title : '';
        draftId = typeof d.id === 'string' ? d.id : null;
        lastDraftTitle = input.value.trim();
        updateSend();
      });

      function updateSend() {
        send.disabled = saving || !input.value.trim();
        send.setAttribute('aria-label', saving ? '할 일 저장 중' : draftId ? '이전 할 일 저장 확인' : '할 일 추가');
      }

      function setNote(n) {
        inputNote = n;
        U.clear(note);
        note.hidden = !n;
        if (!n) return;
        note.classList.toggle('danger', !!n.danger);
        note.append(n.text);
        if (n.action) {
          note.append(' ');
          note.append(h('button', { type: 'button', class: 'linkish', text: n.action.label, onclick: () => ctx.handleAction(n.action, () => add()) }));
        }
      }

      async function load() {
        loading = true;
        renderList();
        const res = await B.invoke('pet:tasks-list', {});
        if (!alive) return;
        loading = false;
        view = E.describeRead(res, '할 일');
        if (view.showData) {
          const data = (res && res.data) || {};
          if (Array.isArray(data.tasks)) {
            tasks = data.tasks.filter((t) => t && t.id != null && typeof t.title === 'string');
            if (data.partial === true && view.state === 'live') view = E.describeRead({ kind: 'partial' }, '할 일');
          } else {
            view = E.describeRead({ kind: 'invalid' }, '할 일');
          }
          loadedAt = new Date();
        }
        renderList();
      }

      function visible() { return grace.visible(tasks, includeCompleted); }

      function renderList() {
        const failed = view && !view.showData;
        const shown = visible();
        countText.textContent = T.countLabel({ loading: loading && !loadedAt, failed: failed && !loadedAt, visibleTasks: shown });
        viewBtn.querySelector('.label').textContent = includeCompleted ? '완료 포함' : '목록 보기';
        U.clear(scroll);
        if (loading && !loadedAt) {
          scroll.append(U.skeleton(4));
        } else {
          if (view && view.state !== 'live') {
            scroll.append(U.notice(view, (a) => ctx.handleAction(a, load), { compact: view.state === 'partial' }));
          }
          if (loadedAt) {
            if (!shown.length && !failed) {
              const done = tasks.filter(T.isDone).length;
              scroll.append(h('div', { class: 'empty' }, U.icon('list', 23), h('span', { text: T.emptyMessage(done) })));
            }
            const list = h('div', { class: 'task-list', role: 'list' });
            for (const task of shown) list.append(row(task, shown));
            scroll.append(list);
          }
        }
        status.textContent = statusLabel();
      }

      function statusLabel() {
        if (loading) return 'Hub 새로고침 중…';
        if (!view) return '';
        if (view.state === 'live' || view.state === 'partial') {
          const when = loadedAt && Date.now() - loadedAt < 60000 ? '방금 동기화' : loadedAt ? `${U.clock(loadedAt)} 동기화` : '';
          return view.state === 'partial' ? `일부만 확인 · ${when}` : when;
        }
        return loadedAt ? `${view.label} · 마지막 ${U.clock(loadedAt)}` : view.label;
      }

      function row(task, shown) {
        const done = T.isDone(task);
        const retained = done && grace.isRetained(task.id);
        const r = h('button', {
          type: 'button', role: 'listitem', class: `row task-row${done ? ' done' : ''}${busy.has(task.id) ? ' busy' : ''}`,
          'aria-label': `${task.title} ${done ? '완료 취소' : '완료'}`,
          title: done ? '완료했어요 · 다시 눌러 취소 · 기본 목록에서 3초 뒤 숨김' : `${task.title} · 우클릭하면 더보기`,
          'aria-busy': busy.has(task.id) ? 'true' : null,
        });
        r.append(U.checkGlyph(done, 20));
        r.append(h('span', { class: 'text' }, h('span', { class: 't', text: task.title })));
        if (retained) r.append(h('span', { class: 'hide-hint', text: '3초 뒤 숨김' }));
        r.addEventListener('click', () => toggle(task, shown));
        r.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          U.openMenu({ x: e.clientX, y: e.clientY }, [
            { label: 'Council 안건으로 준비', icon: 'people', onSelect: () => prepareCouncil(task) },
            { label: 'Hub에서 열기', icon: 'arrowUpRight', onSelect: () => ctx.openHub(C.HUB_PATHS.tasks) },
          ], { label: `${task.title} 메뉴` });
        });
        return r;
      }

      async function toggle(task, shown) {
        if (busy.has(task.id)) return;
        const done = T.isDone(task);
        const order = shown.map((t) => t.id);
        busy.add(task.id);
        renderList();
        const res = await B.invoke('pet:tasks-toggle', { id: task.id, status: done ? 'todo' : 'done', expectedUpdatedAt: task.updatedAt || null });
        if (!alive) return;
        busy.delete(task.id);
        const w = E.describeWrite(res, '할 일');
        if (w.ok) {
          const saved = res.data && res.data.task && res.data.task.id === task.id ? res.data.task : { ...task, status: done ? 'todo' : 'done' };
          tasks = tasks.map((t) => (t.id === task.id ? saved : t));
          if (T.isDone(saved)) grace.retain(task.id, order); else grace.cancel(task.id);
          setNote(null);
        } else if (w.kind === 'conflict') {
          setNote({ text: '다른 곳에서 먼저 바뀌어 새로 불러왔어요.', danger: false });
          load();
        } else {
          setNote({ text: w.message, danger: w.kind === 'error' || w.kind === 'invalid', action: w.action && w.action.kind !== 'retry' ? w.action : null });
        }
        renderList();
      }

      async function add() {
        const v = T.validateTitle(input.value);
        if (!v.ok) { setNote({ text: v.error, danger: true }); input.focus(); return; }
        if (saving) return;
        if (!draftId || lastDraftTitle !== v.value) draftId = globalThis.crypto.randomUUID();
        lastDraftTitle = v.value;
        B.store.set('petPreview.taskDraft', { title: input.value, id: draftId });
        saving = true;
        updateSend();
        const res = await B.invoke('pet:tasks-add', { title: v.value, id: draftId });
        if (!alive) return;
        saving = false;
        const w = E.describeWrite(res, '할 일');
        const replayed = w.ok && T.isReplayedAdd(res, v.value);
        if (w.ok && replayed) {
          // 확인이 안 됐던 앞 할 일을 먼저 저장했다(새 입력이 앞지르지 않는다). 지금 입력은 그대로 두고 다시 누르게 한다.
          const saved = res.data.task && res.data.task.id != null ? res.data.task : null;
          if (saved) tasks = [saved].concat(tasks.filter((t) => t.id !== saved.id));
          draftId = null;
          lastDraftTitle = '';
          B.store.set('petPreview.taskDraft', input.value ? { title: input.value, id: null } : null);
          setNote({ text: `확인이 필요했던 ‘${T.shortTitle(res.data.title)}’을 먼저 저장했어요. 지금 입력은 한 번 더 추가해 주세요.` });
        } else if (w.ok) {
          const saved = res.data && res.data.task && res.data.task.id != null ? res.data.task : null;
          if (saved) tasks = [saved].concat(tasks.filter((t) => t.id !== saved.id));
          if (input.value.trim() === v.value) input.value = '';
          draftId = null;
          lastDraftTitle = '';
          B.store.set('petPreview.taskDraft', input.value ? { title: input.value, id: null } : null);
          setNote(saved ? null : { text: '저장했어요. 목록을 새로 불러올게요.' });
          if (!saved) load();
        } else {
          setNote({ text: w.message, danger: w.kind === 'error' || w.kind === 'invalid', action: w.action });
        }
        updateSend();
        renderList();
        input.focus();
      }

      function prepareCouncil(task) {
        B.store.set('petCouncil.draft', M.chat.draftFromTask(task));
        B.store.set('petCouncil.source', { kind: 'task', id: String(task.id), title: task.title });
        ctx.setMode('council');
      }

      function openViewMenu() {
        U.openMenu(viewBtn, [
          { label: '완료한 할 일 포함', checked: includeCompleted, onSelect: () => { includeCompleted = !includeCompleted; renderList(); } },
        ], { label: '할 일 목록 보기 설정' });
      }

      const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, C.LIMITS.pollMs);
      updateSend();
      load();

      return {
        el,
        focus() { input.focus(); },
        // Ctrl+Enter: 적어 둔 할 일을 추가한다(Hub 열기는 아래 ‘Hub에서 열기’). 빈 입력이면 입력 칸으로.
        primary() { if (input.value.trim()) add(); else input.focus(); },
        menuItems() {
          return [
            { label: '완료한 할 일 포함', checked: includeCompleted, onSelect: () => { includeCompleted = !includeCompleted; renderList(); } },
            { label: '다시 불러오기', icon: 'refresh', onSelect: load },
            { label: 'Hub에서 열기', icon: 'arrowUpRight', onSelect: () => ctx.openHub(C.HUB_PATHS.tasks) },
          ];
        },
        onHubStatus(status, before) { if (status === 'connected' && before !== 'connected') load(); },
        onWindowFocus() { if (!loading && (!loadedAt || Date.now() - loadedAt > 20000)) load(); },
        destroy() { alive = false; clearInterval(timer); grace.reset(); },
      };
    },
  };
})();
