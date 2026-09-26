// 빠른 메모 — 넓은 입력면. 매 키 입력은 이 PC(petPreview.memo)에 남고, Hub 저장은 버튼·Ctrl+S·Ctrl+Enter 로만.
// 저장이 확인되면 입력을 비우고 다음 입력은 새 메모다. 충돌이면 입력을 지키고 ⋯ 의 ‘새 항목으로 Hub에 저장’을 연다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.memo = {
    create(ctx) {
      const { B, U, M } = ctx;
      const MM = M.memo;
      const h = U.h;

      let saving = false;
      let pending = { memo: null, savedMemo: null, memoConflict: false };
      let pendingKey = MM.pendingKey(ctx.state.hubUrl);
      let captured = [];
      let savedBody = null;
      let receipt = null; // { text, danger, action }
      let alive = true;

      const editor = h('textarea', {
        class: 'memo-editor', placeholder: '떠오른 생각을 적어보세요.', 'aria-label': '메모 입력', spellcheck: 'false',
      });
      const s1 = h('div', { class: 's1' });
      const s2 = h('div', { class: 's2', role: 'status' });
      const saveBtn = U.action('Hub에 저장', { icon: 'arrowUp', iconFirst: true, iconSize: 13, title: '저장 확인 후 새 메모로 시작해요 · Ctrl+S / Ctrl+Enter', onClick: () => save() });
      const collapseBtn = U.action(null, { compact: true, icon: 'chevronDown', iconSize: 15, className: 'collapse', ariaLabel: '메모 접기', title: '펫으로 접기 · Esc', onClick: () => ctx.collapse() });
      const footer = h('div', { class: 'memo-footer' }, h('div', { class: 'status-col' }, s1, s2), saveBtn, collapseBtn);
      const el = h('section', { class: 'mode memo', 'aria-label': '빠른 메모' }, editor, footer);

      editor.addEventListener('input', () => {
        B.store.set('petPreview.memo', editor.value);
        if (receipt && !receipt.keep) receipt = null;
        render();
      });

      function persistPending() {
        if (pendingKey) B.store.set(pendingKey, pending);
      }

      function render() {
        const draft = editor.value;
        s1.textContent = MM.statusLabel({ saving, draft, savedBody });
        U.clear(s2);
        s2.classList.remove('danger');
        if (receipt) {
          s2.classList.toggle('danger', !!receipt.danger);
          s2.append(receipt.text);
          if (receipt.action) {
            s2.append(' ');
            s2.append(h('button', { type: 'button', text: receipt.action.label, onclick: () => ctx.handleAction(receipt.action, () => save()) }));
          }
        }
        saveBtn.querySelector('.label').textContent = MM.saveButtonLabel({ saving, pending: pending.memo });
        saveBtn.disabled = !MM.canSave({ saving, draft, pending: pending.memo });
      }

      async function run(request) {
        saving = true;
        pending.memo = request;
        persistPending();
        receipt = null;
        render();
        const res = await B.invoke('pet:journal-save', request);
        if (!alive) return;
        finish(request, res);
      }

      function finish(request, res) {
        saving = false;
        const r = MM.interpretSave(res, request, editor.value);
        pending.memo = r.pendingMemo;
        if (r.outcome === 'saved') {
          pending.savedMemo = r.savedEntry || { id: request.entryId };
          pending.memoConflict = false;
          captured = MM.pushCaptured(captured, request.body);
          B.store.set('petPreview.capturedMemos', captured);
          savedBody = request.body;
          if (r.clearDraft) {
            editor.value = '';
            B.store.set('petPreview.memo', '');
            savedBody = null;
          }
          receipt = { text: `Hub에 저장했어요 · ${U.clock(new Date())}${r.clearDraft ? ' · 새 메모로 시작해요' : ''}`, keep: true };
        } else if (r.conflict) {
          pending.memoConflict = true;
          receipt = { text: r.message, keep: true };
        } else {
          receipt = { text: r.message, danger: ['error', 'invalid'].includes(res && res.kind), action: r.action && r.action.kind !== 'retry' ? r.action : null, keep: true };
        }
        persistPending();
        render();
      }

      async function save() {
        if (saving) return;
        const body = editor.value;
        // 빈 입력창에서도 미확인 요청은 확인할 수 있다.
        if (!body.trim() && pending.memo) return confirmPending();
        const v = MM.validateBody(body);
        if (!v.ok) { receipt = { text: v.error, danger: true }; render(); return; }
        if (pending.memoConflict && !(pending.memo && pending.memo.body === body)) {
          receipt = { text: '충돌한 메모는 덮어쓰지 않아요. 더보기의 ‘새 항목으로 Hub에 저장’을 눌러 주세요.', keep: true };
          render();
          return;
        }
        const request = MM.requestFor(body, pending, () => globalThis.crypto.randomUUID());
        if (pending.memo && pending.memo === request) return confirmPending();
        return run(request);
      }

      // 불확실한 저장: 먼저 같은 entryId 를 읽어 이미 남았는지 보고, 없으면 같은 요청을 다시 보낸다.
      async function confirmPending() {
        const request = pending.memo;
        saving = true;
        render();
        const res = await B.invoke('pet:journal-read', { entryId: request.entryId });
        if (!alive) return;
        const entry = res && res.kind === 'live' && res.data ? res.data.entry : null;
        if (entry && entry.body === request.body) {
          finish(request, { kind: 'live', data: { entry, verified: true } });
          return;
        }
        saving = false;
        run(request);
      }

      function saveAsNew() {
        const body = editor.value;
        const v = MM.validateBody(body);
        if (!v.ok) { receipt = { text: v.error, danger: true }; render(); return; }
        pending.memoConflict = false;
        run(MM.buildSaveRequest(body, () => globalThis.crypto.randomUUID()));
      }

      function continueInCouncil() {
        const text = M.chat.draftFromMemo(editor.value);
        if (!text) return;
        B.store.set('petCouncil.draft', text);
        B.store.set('petCouncil.source', { kind: 'memo' });
        ctx.setMode('council');
      }

      async function restore() {
        const [draft, list, stored] = await Promise.all([
          B.store.get('petPreview.memo'),
          B.store.get('petPreview.capturedMemos'),
          pendingKey ? B.store.get(pendingKey) : null,
        ]);
        if (!alive) return;
        if (typeof draft === 'string' && !editor.value) editor.value = draft;
        captured = Array.isArray(list) ? list.filter((m) => typeof m === 'string') : [];
        if (stored && typeof stored === 'object') {
          pending = { memo: stored.memo || null, savedMemo: stored.savedMemo || null, memoConflict: !!stored.memoConflict, task: stored.task };
          if (pending.memoConflict) receipt = { text: '다른 곳에서 먼저 바뀐 메모예요. 입력은 보관했어요 — 더보기에서 새 항목으로 저장할 수 있어요.', keep: true };
          else if (pending.memo) receipt = { text: '저장 결과 확인이 필요해요. ‘저장 확인’으로 같은 요청을 다시 확인해요.', keep: true };
        }
        render();
      }

      render();
      restore();

      return {
        el,
        focus() { editor.focus(); },
        save,
        primary: save,
        menuItems() {
          const draft = editor.value;
          return [
            {
              label: '저장한 메모 다시 열기', icon: 'pencil',
              disabled: !captured.length || !!draft || saving || !!pending.memo,
              submenu: () => captured.map((body) => ({ label: MM.capturedLabel(body), onSelect: () => { editor.value = body; B.store.set('petPreview.memo', body); receipt = null; render(); editor.focus(); } })),
            },
            { label: 'Council에서 이어서', icon: 'people', disabled: !draft.trim(), onSelect: continueInCouncil },
            { label: '새 항목으로 Hub에 저장', icon: 'arrowUp', disabled: !pending.memoConflict || !draft.trim() || saving, onSelect: saveAsNew },
            ctx.state.presentation === 'widget'
              ? { label: '빠른 기능으로 되돌리기', icon: 'pin', onSelect: ctx.togglePresentation }
              : { label: '위젯으로 고정', icon: 'pin', onSelect: ctx.togglePresentation },
          ];
        },
        onState(state, prev) {
          const key = MM.pendingKey(state.hubUrl);
          if (prev && key !== pendingKey) { pendingKey = key; pending = { memo: null, savedMemo: null, memoConflict: false }; restore(); }
        },
        destroy() { alive = false; },
      };
    },
  };
})();
