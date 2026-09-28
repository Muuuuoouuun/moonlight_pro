// Council — 담당 Office 에게 바로 묻고 같은 창에서 답을 읽는다. 기본 담당은 지금 캐릭터.
// 질문은 6,000자(UTF-16)까지. 전송 중에는 담당·범위를 잠그고, ‘기다림 중단’ 뒤 다시 보내면 새 요청이다(자동 재전송 없음).
// 브랜드 Council 로 넘기는 것은 ⋯ 의 명시적 동작(pet:council-handoff)이며 웹에서 실행을 눌러야 시작한다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});
  let session = null; // { ownerId, scope } — 패널을 다시 열어도 유지

  Modes.council = {
    // 알림(답변)에서 열 때 그 담당·범위 대화로 — 다음 create 가 이 세션으로 연다. 모르는 범위는 '전체'.
    selectSession(next) {
      if (!next || typeof next.ownerId !== 'string' || typeof next.scope !== 'string') return;
      const V = window.PetModel && window.PetModel.chat;
      session = { ownerId: next.ownerId, scope: V && V.isScope && !V.isScope(next.scope) ? 'all' : next.scope };
    },
    create(ctx) {
      const { C, B, U, M } = ctx;
      const V = M.chat;
      const E = M.envelope;
      const h = U.h;

      if (!session || !V.agentFor(session.ownerId)) session = { ownerId: V.defaultOwner(ctx.state.character), scope: 'all' };
      let turns = [];
      let busy = false;
      let sessionView = null;
      let loadingSession = false;
      let pendingMessage = null;
      let lockedByOther = false; // 다른 대화가 답을 기다리는 중(허브가 보내기를 busy 로 거절한다)
      const gate = V.createSendGate();
      let feedback = null; // { text, danger, action }
      let source = { kind: 'text' };
      let alive = true;
      let seq = 0;

      const agentBtn = h('button', { type: 'button', class: 'picker', 'aria-haspopup': 'menu' });
      const scopeBtn = U.quiet('', { icon: 'filter', iconSize: 13, menu: true });
      const conversation = h('div', { class: 'conversation', role: 'log', 'aria-live': 'polite', 'aria-label': '대화' });
      const scroll = h('div', { class: 'scroll' }, conversation);
      const metaLeft = h('span', {});
      const counter = h('span', { class: 'mono' });
      const textarea = h('textarea', { placeholder: '담당자에게 물어볼 내용을 적어보세요.', 'aria-label': '담당 Office에게 질문', spellcheck: 'false' });
      const composer = h('div', { class: 'composer' }, h('div', { class: 'meta' }, metaLeft, counter), h('div', { class: 'field' }, textarea));
      const note = h('span', { class: 'note' });
      const footerAction = h('span', {});
      const footer = h('div', { class: 'council-footer' }, note, footerAction);
      const el = h('section', { class: 'mode council', 'aria-label': 'Council 대화' },
        h('div', { class: 'council-controls' }, agentBtn, h('span', { class: 'grow' }), scopeBtn), scroll, composer, footer);

      agentBtn.addEventListener('click', () => {
        if (busy) return;
        U.openMenu(agentBtn, V.agents().map((a) => ({
          label: `${a.name} · ${a.role}`, checked: a.ownerId === session.ownerId, onSelect: () => switchSession({ ownerId: a.ownerId, scope: session.scope }),
        })), { label: '담당 Office' });
      });
      scopeBtn.addEventListener('click', () => {
        if (busy) return;
        U.openMenu(scopeBtn, V.SCOPES.map((s) => ({
          label: s.label, checked: s.value === session.scope, onSelect: () => switchSession({ ownerId: session.ownerId, scope: s.value }),
        })), { label: '업무 범위' });
      });
      textarea.addEventListener('input', () => {
        B.store.set('petCouncil.draft', textarea.value);
        renderComposer();
      });

      function switchSession(next) {
        if (busy || V.sameSession(next, session)) return;
        session = next;
        feedback = null;
        loadSession();
      }

      async function loadSession() {
        const mySeq = ++seq;
        loadingSession = true;
        turns = [];
        render();
        const res = await B.invoke('pet:chat-session', { ownerId: session.ownerId, scope: session.scope });
        if (!alive || mySeq !== seq) return;
        loadingSession = false;
        sessionView = E.describeRead(res, '대화');
        const data = (res && res.data) || {};
        if (sessionView.showData) {
          turns = Array.isArray(data.turns) ? data.turns : [];
          const lock = V.sessionLock(data, session);
          busy = lock.busy;
          lockedByOther = lock.lockedByOther;
          if (!textarea.value && typeof data.draft === 'string' && data.draft) textarea.value = data.draft;
        }
        render();
        scrollToEnd();
      }

      function renderControls() {
        const a = V.agentFor(session.ownerId);
        const c = C.CHARACTERS.find((x) => x.officeId === session.ownerId) || C.characterByKey(ctx.state.character);
        U.clear(agentBtn).append(
          h('img', { src: U.assetUrl(c.portrait), alt: '' }),
          h('span', {}, h('div', { class: 'pn', text: a ? a.name : c.name }), h('div', { class: 'pr', text: a ? a.role : c.role })),
          U.icon('chevronDown', 11));
        agentBtn.disabled = V.pickerLocked(busy);
        agentBtn.title = busy ? '담당자를 바꾸려면 먼저 기다림을 중단해 주세요.' : '질문을 받을 담당 Office를 골라요.';
        agentBtn.setAttribute('aria-label', `담당 Office: ${a ? `${a.name}, ${a.role}` : c.name}`);
        let scopeLabel = scopeBtn.querySelector('.label');
        if (!scopeLabel) { scopeLabel = h('span', { class: 'label' }); scopeBtn.append(scopeLabel); }
        scopeLabel.textContent = V.scopeLabel(session.scope);
        scopeBtn.disabled = V.pickerLocked(busy);
        scopeBtn.title = busy ? '업무 범위를 바꾸려면 먼저 기다림을 중단해 주세요.' : '대화할 업무 범위를 골라요.';
        scopeBtn.setAttribute('aria-label', `업무 범위: ${V.scopeLabel(session.scope)}`);
      }

      function turnEl(t) {
        if (t.role === 'user') {
          return h('div', { class: 'turn-user' }, h('span', { class: 'mini-rim rim-20', 'aria-hidden': 'true' }),
            h('div', { class: 'who', text: '나' }), h('div', { class: 'tx', text: t.text }));
        }
        const a = V.agentFor(t.ownerId || session.ownerId);
        const box = h('div', { class: 'turn-bot' },
          h('div', { class: 'who', text: `${a ? a.name : 'Office'} · ${V.scopeLabel(t.scope || session.scope)}` }),
          h('div', { class: 'tx', text: t.text }));
        if (t.persisted === false) box.append(h('div', { class: 'note', text: '이 답변의 Hub 기록 저장은 확인되지 않았어요.' }));
        return box;
      }

      function renderConversation() {
        U.clear(conversation);
        if (loadingSession) { conversation.append(U.skeleton(2)); return; }
        if (sessionView && !sessionView.showData) {
          conversation.append(U.notice(sessionView, (x) => ctx.handleAction(x, loadSession)));
        }
        const shown = V.visibleTurns(turns);
        if (!shown.length && !pendingMessage && (!sessionView || sessionView.showData)) {
          conversation.append(h('div', { class: 'council-empty' },
            h('div', { class: 'h', text: '담당 Office에 바로 물어보세요' }),
            h('div', { class: 's', text: '답변을 여기서 읽고, 이어서 질문할 수 있어요. 할 일·메모는 더보기에서 불러와요.' })));
        }
        shown.forEach((t) => conversation.append(turnEl(t)));
        if (pendingMessage) {
          conversation.append(turnEl({ role: 'user', text: pendingMessage }));
          conversation.append(h('div', { class: 'waiting', role: 'status' }, h('span', { class: 'dotpulse', 'aria-hidden': 'true' }), h('span', { text: '답변 기다리는 중' })));
        } else if (busy) {
          conversation.append(h('div', { class: 'waiting', role: 'status' }, h('span', { class: 'dotpulse', 'aria-hidden': 'true' }), h('span', { text: '이전 질문의 답변을 기다리는 중' })));
        }
        if (feedback) conversation.append(U.notice({ state: feedback.danger ? 'error' : 'info', label: feedback.label, message: feedback.text, action: feedback.action }, (x) => ctx.handleAction(x), { compact: true, glyph: feedback.glyph }));
      }

      function renderComposer() {
        const draft = textarea.value;
        metaLeft.textContent = `질문 · ${V.sourceLabel(source)}`;
        counter.textContent = V.counterLabel(draft);
        counter.classList.toggle('over', V.overLimit(draft));
        note.textContent = V.footerNote(draft);
        note.classList.toggle('over', V.overLimit(draft));
        U.clear(footerAction);
        if (busy) {
          footerAction.append(U.action('기다림 중단', { title: '기다림을 중단하고 입력을 보관해요. 다시 보내면 새 요청이에요.', onClick: cancel }));
        } else {
          footerAction.append(U.action('질문 보내기', {
            icon: 'arrowUp', iconSize: 13, iconFirst: true,
            title: lockedByOther ? '다른 담당자의 답을 기다리는 중이에요. 답이 오면 보낼 수 있어요.' : '질문 보내기 · Ctrl+Enter',
            disabled: !V.canSend({ draft, busy: busy || lockedByOther }), onClick: send,
          }));
        }
      }

      function render() { renderControls(); renderConversation(); renderComposer(); }
      function scrollToEnd() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }

      async function send() {
        const message = textarea.value;
        if (!V.canSend({ draft: message, busy: busy || lockedByOther })) return;
        const at = session;
        const token = gate.begin();
        busy = true;
        pendingMessage = message;
        feedback = null;
        render();
        scrollToEnd();
        const res = await B.invoke('pet:chat-send', { ownerId: at.ownerId, scope: at.scope, message });
        // 중단한 뒤 다시 보냈으면 이 응답은 지난 요청의 것 — 새 요청의 잠금·입력·안내를 건드리지 않는다.
        if (!alive || !gate.isCurrent(token)) return;
        busy = false;
        pendingMessage = null;
        const w = E.describeWrite(res, '질문');
        const turn = w.ok && res.data && res.data.turn && typeof res.data.turn.text === 'string' ? res.data.turn : null;
        if (turn) {
          if (V.sameSession(at, session)) {
            // 답 이벤트(pet:chat-reply)가 이 응답보다 먼저 와 있을 수 있다 — 질문 다음에 답이 오도록 순서를 다시 세운다.
            turns = turns.filter((t) => t.id !== turn.id).concat([
              { id: `local-${Date.now()}`, role: 'user', text: message, at: new Date().toISOString() },
              { ...turn, ownerId: at.ownerId, scope: at.scope },
            ]);
          }
          textarea.value = V.draftAfterSuccess(message, textarea.value);
          B.store.set('petCouncil.draft', textarea.value);
          if (!textarea.value) { source = { kind: 'text' }; B.store.set('petCouncil.source', source); }
        } else {
          feedback = { label: w.label, text: w.ok ? '담당자의 답변을 확인하지 못했어요. 질문은 보관돼 있어요.' : w.message, danger: !w.ok && (w.kind === 'error' || w.kind === 'invalid'), action: w.action && w.action.kind !== 'retry' ? w.action : null };
        }
        render();
        scrollToEnd();
      }

      function cancel() {
        gate.cancel();
        B.invoke('pet:chat-cancel', {});
        busy = false;
        pendingMessage = null;
        feedback = { text: '기다림을 중단했어요. 질문은 보관돼 있어요 — 다시 보내면 새 요청이에요.', glyph: 'info' };
        render();
      }

      async function handoff() {
        const draft = textarea.value;
        if (!V.canHandoff(draft)) return;
        // 셸이 허브 경로(조각 포함)를 메인 창에서 연다 — data.opened 가 true 일 때만 넘긴 것이다.
        const res = await B.invoke('pet:council-handoff', { draft, source: source.kind });
        if (!alive) return;
        const w = E.describeWrite(res, '안건');
        feedback = w.ok && res.data && res.data.opened === true
          ? { text: '메인 창의 브랜드 Council 입력란으로 넘겼어요. 웹에서 실행을 눌러야 시작해요.', glyph: 'arrowUpRight' }
          : { label: w.label, text: w.message, danger: w.kind === 'error', action: w.action && w.action.kind !== 'retry' ? w.action : null };
        render();
        scrollToEnd();
      }

      async function fromMemo() {
        const memo = await B.store.get('petPreview.memo');
        const text = V.draftFromMemo(memo);
        if (!text || !alive) return;
        textarea.value = text;
        source = { kind: 'memo' };
        B.store.set('petCouncil.draft', text);
        B.store.set('petCouncil.source', source);
        renderComposer();
        textarea.focus();
      }

      async function taskItems() {
        const res = await B.invoke('pet:tasks-list', {});
        const view = E.describeRead(res, '할 일');
        if (!view.showData) return [{ heading: view.message }];
        const open = M.tasks.orderTasks((res.data && res.data.tasks) || []).filter((t) => !M.tasks.isDone(t));
        return open.map((t) => ({
          label: M.tasks.shortTitle(t.title), title: t.title,
          onSelect: () => {
            textarea.value = V.draftFromTask(t);
            source = { kind: 'task', id: String(t.id), title: t.title };
            B.store.set('petCouncil.draft', textarea.value);
            B.store.set('petCouncil.source', source);
            renderComposer();
            textarea.focus();
          },
        }));
      }

      async function restoreDraft() {
        const [draft, src] = await Promise.all([B.store.get('petCouncil.draft'), B.store.get('petCouncil.source')]);
        if (!alive) return;
        if (typeof draft === 'string' && draft) textarea.value = draft;
        if (src && typeof src === 'object' && src.kind) source = src;
        renderComposer();
      }

      render();
      restoreDraft().then(loadSession);

      return {
        el,
        focus() { textarea.focus(); },
        primary: send,
        menuItems() {
          const draft = textarea.value;
          return [
            { label: '직접 입력', icon: 'pencil', onSelect: () => { source = { kind: 'text' }; B.store.set('petCouncil.source', source); renderComposer(); textarea.focus(); } },
            { label: '현재 메모 불러오기', icon: 'pencil', onSelect: fromMemo },
            { label: '할 일 불러오기', icon: 'list', submenu: taskItems },
            { divider: true },
            { label: '브랜드 Council에서 검토', icon: 'arrowUpRight', disabled: !V.canHandoff(draft), title: `초안 ${V.HANDOFF_LIMIT.toLocaleString('en-US')}자까지 브라우저로 넘겨요`, onSelect: handoff },
          ];
        },
        onChatReply(p) {
          if (!p || !p.turn || !V.sameSession(p, session)) return;
          if (turns.some((t) => t.id === p.turn.id)) return;
          // 이 화면이 보낸 질문의 답이면 send() 가 질문과 함께 순서대로 넣는다.
          if (pendingMessage) return;
          turns = turns.concat([{ ...p.turn, ownerId: p.ownerId, scope: p.scope }]);
          if (!pendingMessage) busy = false;
          render();
          scrollToEnd();
        },
        onState(state, prev) {
          // 캐릭터를 바꾸면(전송 중이 아닐 때) 기본 담당도 따라간다.
          if (prev && state.character !== prev.character && !busy && session.ownerId === V.defaultOwner(prev.character)) {
            switchSession({ ownerId: V.defaultOwner(state.character), scope: session.scope });
          }
        },
        onHubStatus(s, before) { if (s === 'connected' && before !== 'connected') loadSession(); },
        destroy() { alive = false; },
      };
    },
  };
})();
