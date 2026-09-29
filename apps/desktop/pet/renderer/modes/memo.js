// 빠른 메모 — 넓은 입력면. 매 키 입력은 이 PC(petPreview.memo)에 남고, Hub 저장은 버튼·Ctrl+S·Ctrl+Enter(mac ⌘S·⌘Return) 로만.
// 저장이 확인되면 입력을 비우고 다음 입력은 새 메모다. 충돌이면 입력을 지키고 ⋯ 의 ‘새 항목으로 Hub에 저장’을 연다.
// 확인되지 않은 저장·충돌 표시는 메인의 허브 모델이 가진다(data.pending) — 이 화면은 그 요약만 읽는다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});

  Modes.memo = {
    create(ctx) {
      const { B, U, M } = ctx;
      const MM = M.memo;
      const h = U.h;

      let saving = false;
      let pending = null; // MM.pendingFrom — { hasPendingMemo, pendingMemoRole, captureConflict, conflictId }
      let captured = [];
      let savedBody = null;
      let receipt = null; // { text, danger, action, keep }
      let alive = true;
      let hubUrl = ctx.state.hubUrl;

      const editor = h('textarea', {
        class: 'memo-editor', placeholder: '떠오른 생각을 적어보세요.', 'aria-label': '메모 입력', spellcheck: 'false',
      });
      const s1 = h('div', { class: 's1' });
      const s2 = h('div', { class: 's2', role: 'status' });
      const saveBtn = U.action('Hub에 저장', { icon: 'arrowUp', iconFirst: true, iconSize: 13, title: `저장 확인 후 새 메모로 시작해요 · ${M.platform.hotkey('S')} / ${M.platform.hotkey('Enter')}`, onClick: () => save() });
      const collapseBtn = U.action(null, { compact: true, icon: 'chevronDown', iconSize: 15, className: 'collapse', ariaLabel: '메모 접기', title: '펫으로 접기 · Esc', onClick: () => ctx.collapse() });
      const footer = h('div', { class: 'memo-footer' }, h('div', { class: 'status-col' }, s1, s2), saveBtn, collapseBtn);
      const el = h('section', { class: 'mode memo', 'aria-label': '빠른 메모' }, editor, footer);

      editor.addEventListener('input', () => {
        B.store.set('petPreview.memo', editor.value);
        if (receipt && !receipt.keep) receipt = null;
        render();
      });

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
        saveBtn.querySelector('.label').textContent = MM.saveButtonLabel({ saving, pending });
        saveBtn.disabled = !MM.canSave({ saving, draft, pending });
      }

      async function run(request) {
        saving = true;
        receipt = null;
        render();
        const res = await B.invoke('pet:journal-save', request);
        if (!alive) return;
        saving = false;
        const r = MM.interpretSave(res, request, editor.value);
        if (r.pending) pending = r.pending;
        if (r.outcome === 'saved') {
          captured = MM.pushCaptured(captured, request.body);
          B.store.set('petPreview.capturedMemos', captured);
          savedBody = request.body;
          if (r.clearDraft) {
            editor.value = '';
            B.store.set('petPreview.memo', '');
            savedBody = null;
          }
          receipt = { text: `Hub에 저장했어요 · ${U.clock(new Date())}${r.clearDraft ? ' · 새 메모로 시작해요' : ''}`, keep: true };
        } else if (r.outcome === 'replayed') {
          receipt = { text: r.message, keep: true };
        } else if (r.outcome === 'conflict') {
          receipt = { text: r.message, keep: true };
        } else {
          receipt = { text: r.message, danger: ['error', 'invalid'].includes(res && res.kind), action: r.action && r.action.kind !== 'retry' ? r.action : null, keep: true };
        }
        render();
      }

      function save() {
        if (saving) return undefined;
        const body = editor.value;
        // 보류 중인 저장은 빈 입력창에서도 확인한다 — 허브가 같은 명령을 먼저 다시 보낸다.
        if (pending && pending.hasPendingMemo) return run(MM.captureRequest(body));
        if (pending && pending.captureConflict) {
          receipt = { text: '충돌한 메모는 덮어쓰지 않아요. 더보기의 ‘새 항목으로 Hub에 저장’을 눌러 주세요.', keep: true };
          render();
          return undefined;
        }
        const v = MM.validateBody(body);
        if (!v.ok) { receipt = { text: v.error, danger: true }; render(); return undefined; }
        return run(MM.captureRequest(body));
      }

      function saveAsNew() {
        const body = editor.value;
        const v = MM.validateBody(body);
        if (!v.ok) { receipt = { text: v.error, danger: true }; render(); return; }
        run(MM.asNewRequest(body, pending));
      }

      function continueInCouncil() {
        const text = M.chat.draftFromMemo(editor.value);
        if (!text) return;
        B.store.set('petCouncil.draft', text);
        B.store.set('petCouncil.source', { kind: 'memo' });
        ctx.setMode('council');
      }

      // 허브 모델의 보류·충돌 요약. 대상 없는 journal-read 는 확인된 캡처 메모가 없으면 네트워크를 쓰지 않는다.
      async function loadPending() {
        const res = await B.invoke('pet:journal-read', {});
        if (!alive) return;
        pending = MM.pendingFrom(res);
        if (pending && pending.captureConflict) receipt = { text: '다른 곳에서 먼저 바뀐 메모예요. 입력은 보관했어요 — 더보기에서 새 항목으로 저장할 수 있어요.', keep: true };
        else if (pending && pending.hasPendingMemo) receipt = { text: '저장 결과 확인이 필요해요. ‘저장 확인’으로 같은 요청을 다시 확인해요.', keep: true };
        render();
      }

      async function restore() {
        const [draft, list] = await Promise.all([B.store.get('petPreview.memo'), B.store.get('petPreview.capturedMemos')]);
        if (!alive) return;
        if (typeof draft === 'string' && !editor.value) editor.value = draft;
        captured = Array.isArray(list) ? list.filter((m) => typeof m === 'string') : [];
        render();
        loadPending();
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
              disabled: !captured.length || !!draft || saving || !!(pending && pending.hasPendingMemo),
              submenu: () => captured.map((body) => ({ label: MM.capturedLabel(body), onSelect: () => { editor.value = body; B.store.set('petPreview.memo', body); receipt = null; render(); editor.focus(); } })),
            },
            { label: 'Council에서 이어서', icon: 'people', disabled: !draft.trim(), onSelect: continueInCouncil },
            { label: '새 항목으로 Hub에 저장', icon: 'arrowUp', disabled: !(pending && pending.captureConflict) || !draft.trim() || saving, onSelect: saveAsNew },
            ctx.state.presentation === 'widget'
              ? { label: '빠른 기능으로 되돌리기', icon: 'pin', onSelect: ctx.togglePresentation }
              : { label: '위젯으로 고정', icon: 'pin', onSelect: ctx.togglePresentation },
          ];
        },
        onState(state) {
          if (state.hubUrl !== hubUrl) { hubUrl = state.hubUrl; pending = null; receipt = null; loadPending(); }
        },
        onHubStatus(status, before) { if (status === 'connected' && before !== 'connected') loadPending(); },
        destroy() { alive = false; },
      };
    },
  };
})();
