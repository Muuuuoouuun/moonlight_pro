'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});
  // Preserve the pre-PR Electron Mac card; the default Mac pet remains native SwiftUI.
  function createMacOfficeCard(ctx) {
    const { C, U } = ctx;
    const h = U.h;
    const who = h('div', { class: 'who' });
    const statusBox = h('div', {});
    const bottom = h('div', { class: 'bottom' });
    const el = h('section', { class: 'mode office', 'aria-label': 'Office' },
      h('p', { class: 'lead', text: '함께 진행할 작업을 열어요.' }),
      h('p', { class: 'sub', text: '메인 창의 Office 보드에서 이어져요. 펫은 여는 길만 맡아요.' }),
      who, statusBox, h('div', { class: 'spacer' }), bottom);

    function render(state) {
      const c = C.characterByKey(state.character);
      U.clear(statusBox);
      U.clear(bottom);
      const blocked = state.hubStatus === 'unauthorized' ? { label: '로그인 필요', message: '메인 창에서 로그인하면 Office 보드가 열려요.', button: '메인 창에서 로그인', path: '/login', glyph: 'lock' }
        : state.hubStatus === 'not-configured' && state.hubUrl ? { label: 'Hub 로그인 미설정', message: 'Hub 서버에 운영자 로그인 설정이 아직 없어요.', button: '메인 창 열기', path: '/dashboard', glyph: 'info' }
        : state.hubStatus === 'not-configured' ? { label: 'Hub 주소 필요', message: '메인 창에서 Hub 주소를 먼저 정해 주세요.', button: '메인 창 열기', path: '/dashboard', glyph: 'info' }
          : null;
      who.hidden = !!blocked;
      if (!blocked) {
        U.clear(who).append(h('img', { src: U.assetUrl(c.portrait), alt: '' }), h('span', { text: `지금 펫 · ${c.name} ${c.role}` }));
        bottom.append(U.action('Office 열기', { icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub(C.HUB_PATHS.office) }));
      } else {
        statusBox.append(U.notice({ state: state.hubStatus, label: blocked.label, message: blocked.message }, null, { compact: true, glyph: blocked.glyph }));
        bottom.append(U.action(blocked.button, { icon: 'arrowUpRight', iconSize: 12, onClick: () => ctx.openHub(blocked.path) }));
      }
    }
    render(ctx.state);

    return {
      el,
      focus() { const b = bottom.querySelector('.action'); if (b) b.focus(); },
      primary() { ctx.openHub(C.HUB_PATHS.office); },
      onState(state) { render(state); },
      onHubStatus() { render(ctx.state); },
    };
  }

  const selected = { tab: 'work', scope: 'personal', id: null };
  Modes.office = {
    create(ctx) {
      if (ctx.M.platform.isMac()) return createMacOfficeCard(ctx);
      const { B, U, M, C } = ctx, h = U.h;
      let alive = true, seq = 0, busy = false, loading = false, page = null, detail = null, view = null, synced = null;
      let origin = ctx.state.hubUrl, drafts = {}, pending = null;
      let connectionGeneration = 0, selectionGeneration = 0, diagnostic = null, diagnosticOpen = false, historyStale = false, diagnosticSummary = null;
      const D = M.officeDiagnostic;
      const diagnosticContext = () => ({ connection: connectionGeneration, selection: selectionGeneration, account: ctx.state.accountId ?? null });
      let ownerId = C.characterByKey(ctx.state.character).officeId;
      const tabs = U.segmented([{ value: 'work', label: '작업' }, { value: 'chat', label: '대화' }], selected.tab, tab => change({ tab, id: null }));
      const scope = U.segmented([{ value: 'personal', label: '개인' }, { value: 'classin', label: '회사' }], selected.scope, value => change({ scope: value, id: null }));
      const list = h('div', { class: 'office-list scroll', 'aria-label': '저장된 Office 기록' });
      const content = h('div', { class: 'office-result scroll', tabindex: '0', 'aria-label': '선택한 기록 내용' });
      const notice = h('div', { class: 'office-notice', role: 'status' });
      const editor = h('textarea', { placeholder: '담당자에게 물어볼 내용을 적어보세요.', 'aria-label': 'Office 질문', maxlength: '6000' });
      const owner = U.quiet('', { icon: 'people', menu: true, onClick: () => {
        if (busy || detail) return;
        U.openMenu(owner, C.CHARACTERS.map(c => ({ label: `${c.name} · ${c.role}`, checked: c.officeId === ownerId,
          onSelect: () => { ownerId = c.officeId; render(); } })), { label: '담당자' });
      } });
      const composer = h('div', { class: 'composer office-composer' }, owner, h('div', { class: 'field' }, editor));
      const footer = h('div', { class: 'office-footer' });
      const el = h('section', { class: 'mode office', 'aria-label': 'Office 작업과 대화' }, tabs, scope, notice, list, content, composer, footer);
      const key = () => `${origin}|${selected.scope}|${selected.id || 'new'}`;
      const saveDraft = () => { drafts[key()] = editor.value; B.store.set('petOffice.drafts', drafts); };
      const savePending = value => {
        pending = value;
        if (value?.phase === 'send') diagnostic = D.create(value, diagnosticContext());
        return B.store.set('petOffice.pending', value);
      };
      const preparePending = async value => {
        const result = await savePending(value);
        if (result?.ok === true) return true;
        savePending(null);
        busy = false;
        view = { state: 'error', showData: false, label: '입력 보관 실패', message: '요청을 기기에 보관하지 못해 보내지 않았어요. 입력을 복사해 주세요.' };
        render(); return false;
      };
      editor.addEventListener('input', saveDraft);
      const name = id => C.CHARACTERS.find(c => c.officeId === id)?.name || id;
      const label = item => item.intent === 'weekly_report' ? '주간 정리' : '고객 답장 초안';
      const stateLabel = state => ({ generated: '결과 도착 · 업무 반영 전', running: '생성 중', unknown: '결과 확인 필요', error: '생성 실패', expired: '본문 보관 종료' }[state] || state);
      const chat = () => selected.tab === 'chat';
      const pendingHere = () => chat() && pending && pending.origin === origin && pending.scope === selected.scope && pending.id === selected.id;
      const diagnosticHere = () => chat() && diagnostic?.target?.origin === origin && diagnostic.target.scope === selected.scope && diagnostic.target.id === selected.id
        && diagnostic.target.connection === connectionGeneration && diagnostic.target.selection === selectionGeneration;
      const unresolvedMeeting = () => !!detail?.meeting && ((detail.unresolved?.total || 0) > 0 || detail.turns?.some(turn => ['running', 'unknown'].includes(turn.state)));
      const ensureDiagnostic = () => {
        if (pendingHere() && pending.phase === 'send' && (!diagnostic || !D.sameContext(diagnostic.target, D.target(pending, diagnosticContext())))) {
          diagnostic = D.create(pending, diagnosticContext());
        }
      };
      const activePending = () => pending?.origin === origin;
      const connectionView = () => {
        const status = ctx.state.hubStatus;
        if (status === 'unknown') return { state: 'loading', label: '연결 확인 중', message: '메인 창의 로그인 세션을 확인하고 있어요.', showData: false };
        return M.envelope.describeRead({ kind: status === 'unauthorized' ? 'unauthorized' : status === 'offline' ? 'error' : 'not-configured',
          error: status === 'offline' ? 'offline' : status === 'not-configured' && origin ? 'operator-login-not-configured' : undefined }, 'Office 기록');
      };
      const hubPath = () => chat() ? `${C.HUB_PATHS.office}${selected.id ? `?meeting=${encodeURIComponent(selected.id)}&scope=${selected.scope}` : ''}`
        : selected.id ? `/dashboard/agents/office-request?request=${encodeURIComponent(selected.id)}` : C.HUB_PATHS.office;

      function change(next) {
        if (busy) return;
        saveDraft(); Object.assign(selected, next); selectionGeneration++; diagnosticOpen = false;
        detail = null; page = null; view = null; synced = null; historyStale = false; seq++;
        editor.value = drafts[key()] || '';
        tabs.select(selected.tab); scope.select(selected.scope); refresh();
      }
      function render() {
        U.clear(notice); U.clear(list); U.clear(content); U.clear(footer);
        if (view && !view.showData) notice.append(U.notice(view, a => ctx.handleAction(a, refresh), { compact: true }));
        else if (loading) notice.append(h('span', { text: 'Hub에서 불러오는 중…' }));
        if (activePending()) notice.append(h('span', { text: '이전 요청의 결과를 먼저 확인해 주세요. 자동으로 다시 보내지 않아요.' }),
          U.quiet('결과 확인', { onClick: () => change({ tab: 'chat', scope: pending.scope, id: pending.id }) }));
        if (historyStale && detail) notice.append(h('span', { class: 'office-synced', text: '이전 확인 기록 · 최신 조회를 완료하지 못했어요.' }));
        if (diagnosticHere()) renderDiagnostic();
        const items = chat() ? page?.meetings : page?.items;
        if (loading && !items) list.append(U.skeleton(2));
        else if (items && !items.length) list.append(h('div', { class: 'empty', text: chat() ? '저장된 대화가 없어요. 새 대화를 시작해 보세요.' : '아직 저장된 Office 요청이 없어요.' }));
        for (const item of items || []) {
          const id = chat() ? item.meetingId : item.requestId;
          list.append(h('button', { type: 'button', class: 'office-row', 'aria-pressed': String(id === selected.id), onclick: () => select(item) },
            h('span', { class: 'office-row-title', text: chat() ? item.title : label(item) }),
            h('span', { class: 'office-row-meta', text: `${name(item.ownerId)} · ${chat() ? item.state === 'closed' ? '종료됨' : '대화' : stateLabel(item.state)}` })));
        }
        if (page?.hasMore) list.append(U.quiet(chat() ? '이전 대화 더 불러오기' : '이전 요청 더 불러오기', { disabled: loading, onClick: () => refresh(true) }));
        if (detail && ((!view || view.showData) || diagnosticHere() || historyStale)) {
          if (chat()) {
            for (const turn of detail.turns) {
              content.append(h('div', { class: 'turn-user' }, h('div', { class: 'who', text: '나' }), h('div', { text: turn.message })));
              content.append(h('div', { class: 'turn-bot' }, h('div', { class: 'who', text: name(detail.meeting.ownerId) }),
                h('div', { class: 'office-body', text: turn.answer || stateLabel(turn.state) }),
                turn.nextAction ? h('div', { class: 'note', text: `다음 행동 · ${turn.nextAction}` }) : null));
            }
            if (!detail.turns.length) content.append(h('p', { class: 'inline-note', text: '질문은 보내기를 누를 때만 전달돼요.' }));
          } else {
            content.append(h('p', { class: 'inline-note', text: stateLabel(detail.item.state) }), detail.body ? h('div', { class: 'office-body', text: detail.body }) : null);
            if (detail.body) content.append(U.quiet('본문 복사', { onClick: async () => {
              try { await navigator.clipboard.writeText(detail.body); notice.textContent = '본문을 복사했어요.'; }
              catch { notice.textContent = '복사하지 못했어요. 본문을 선택해 복사해 주세요.'; }
            } }));
          }
        }
        content.hidden = !detail; list.classList.toggle('has-detail', !!detail); composer.hidden = !chat();
        editor.disabled = busy || activePending() || detail?.meeting?.state === 'closed';
        owner.disabled = busy || !!detail;
        owner.querySelector('.label')?.remove();
        owner.append(h('span', { class: 'label', text: `${name(detail?.meeting?.ownerId || ownerId)} · ${detail ? '저장된 대화' : '새 대화'}` }));
        footer.append(U.quiet('Hub에서 이어서', { icon: 'arrowUpRight', onClick: () => ctx.openHub(hubPath()) }),
          U.quiet(diagnosticHere() ? '같은 요청 다시 조회' : '새로고침', { icon: 'refresh', disabled: loading || busy || ctx.state.hubStatus !== 'connected', onClick: () => refresh() }));
        if (pendingHere() && pending.phase === 'create') footer.append(U.quiet('대화 저장 확인', { disabled: loading || busy, onClick: recoverCreate }));
        if (chat()) {
          if (selected.id) footer.append(U.quiet('새 대화', { disabled: busy, onClick: () => change({ id: null }) }));
          footer.append(U.action(busy ? '확인 중…' : '보내기', { disabled: busy || activePending() || unresolvedMeeting() || loading || (view && !view.showData) || detail?.meeting?.state === 'closed', onClick: send }));
        }
        for (const button of [...tabs.querySelectorAll('button'), ...scope.querySelectorAll('button')]) button.disabled = busy;
        if (synced && !historyStale && (!view || view.showData)) notice.append(h('span', { class: 'office-synced', text: `${U.clock(synced)} Hub 확인` }));
        if (chat() && detail && (!view || view.showData)) content.scrollTop = content.scrollHeight;
      }
      function renderDiagnostic() {
        const status = D.describe(diagnostic);
        const disclosure = h('details', { class: 'office-diagnostic', open: diagnosticOpen,
          ontoggle: event => { diagnosticOpen = event.target.open; } });
        diagnosticSummary = h('summary', { text: `요청 진단 · ${status.label}${status.stale ? ' · 이전 관측' : ''}` });
        disclosure.append(diagnosticSummary);
        const fields = h('dl', {});
        const field = (label, value, mono = false) => fields.append(h('dt', { text: label }), h('dd', { class: mono ? 'mono' : '', text: value || '확인되지 않음' }));
        field('원래 요청', diagnostic.target.requestId, true);
        field('회의', diagnostic.target.id, true);
        field('연결', diagnostic.target.origin, true);
        field('범위', diagnostic.target.scope === 'personal' ? '개인' : '회사');
        field('세션', '현재 메인 창 연결 · 계정 식별자 미제공');
        field('서버 관측 시각', diagnostic.lastObservation?.serverObservedAt, true);
        field('마지막 정상 수신', diagnostic.lastObservation?.receivedAt, true);
        field('최근 조회 시도', diagnostic.lastAttempt?.startedAt, true);
        field('최근 조회 수신', diagnostic.lastAttempt?.receivedAt, true);
        field('최근 조회 결과', status.attemptLabel);
        disclosure.append(fields, h('p', { text: status.explanation }),
          h('p', { text: pendingHere() ? '원래 요청과 입력을 보관 중이에요. 다시 조회는 회의 기록 읽기만 하며, 재전송·재생성·잠금 해제를 하지 않아요.' : unresolvedMeeting() ? '이 기기에 원래 전송 명령이 없어요. 이 요청은 읽기로만 확인하며 새 질문을 보내지 않아요.' : '같은 요청의 결과를 확인했어요. 이 화면의 진단 관측은 창을 닫으면 초기화돼요.' }));
        notice.append(disclosure);
      }
      async function select(item) {
        if (busy) return;
        saveDraft(); selected.id = chat() ? item.meetingId : item.requestId; selectionGeneration++; diagnosticOpen = false;
        detail = null; historyStale = false; editor.value = drafts[key()] || ''; await readSelected(item);
      }
      function reconcile() {
        if (!pendingHere() || !detail?.meeting || detail.meeting.meetingId !== pending.id || detail.meeting.scope !== pending.scope) return;
        const turn = detail.turns.find(t => t.id === pending.requestId && t.message === pending.message.trim());
        if (pending.phase === 'create' || (turn && ['generated', 'error'].includes(turn.state))) {
          if (turn?.state === 'generated' && editor.value === (pending.draftText ?? pending.message)) { editor.value = ''; saveDraft(); }
          savePending(null);
        }
      }
      function observeRestored(detail, startedAt) {
        if (!chat() || !detail?.meeting || diagnosticHere()) return;
        const turn = detail.turns.find(t => ['running', 'unknown'].includes(t.state));
        if (!turn) return;
        // This is an observation identity only; never synthesize or persist a
        // replacement command/revision for a request created on another client.
        diagnostic = D.create({ origin, scope: detail.meeting.scope, id: detail.meeting.meetingId, requestId: turn.id, message: turn.message, phase: 'send' }, diagnosticContext());
        const attempt = D.begin(diagnostic, startedAt);
        diagnostic = D.finish(attempt.state, attempt.ticket, { kind: 'live', data: detail }, new Date().toISOString()).state;
      }
      async function readSelected(item) {
        ensureDiagnostic();
        const ticket = ++seq, context = diagnosticHere() ? { ...diagnostic.target } : null, startedAt = new Date().toISOString();
        const attempt = context ? D.begin(diagnostic, startedAt) : null;
        if (attempt) diagnostic = attempt.state;
        loading = true; historyStale = !!detail; render();
        const res = await B.invoke(chat() ? 'pet:office-meeting' : 'pet:office-receipt', chat() ? { id: selected.id, scope: selected.scope } : { item });
        if (!alive || ticket !== seq || (context && !D.sameContext(context, diagnostic?.target))) return;
        loading = false; view = M.envelope.describeRead(res, 'Office 기록');
        if (attempt) {
          const observed = D.finish(diagnostic, attempt.ticket, res, new Date().toISOString());
          diagnostic = observed.state;
          if (observed.apply) { detail = res.data; historyStale = false; synced = new Date(); reconcile(); }
        } else {
          if (view.showData) { detail = res.data; historyStale = false; synced = new Date(); observeRestored(detail, startedAt); reconcile(); }
        }
        render();
      }
      async function refresh(more = false) {
        if (busy) return;
        ensureDiagnostic();
        if (ctx.state.hubStatus !== 'connected') {
          seq++; loading = false; page = null;
          if (diagnosticHere()) diagnostic = D.blocked(diagnostic, new Date().toISOString(), ctx.state.hubStatus === 'unauthorized' ? 'unauthorized' : 'offline');
          else { detail = null; synced = null; }
          view = connectionView(); render(); return;
        }
        // Unknown requests are rechecked through the existing meeting GET only.
        // No list dependency, replay, replacement ID or automatic polling.
        if (!more && diagnosticHere()) return readSelected({ meetingId: selected.id });
        const ticket = ++seq; loading = true; historyStale = !!detail; view = null;
        if (!more) page = null;
        render();
        const res = await B.invoke(chat() ? 'pet:office-meetings' : 'pet:office-inbox', { scope: selected.scope, ...(more ? { cursor: page?.nextCursor } : {}) });
        if (!alive || ticket !== seq) return;
        loading = false; view = M.envelope.describeRead(res, 'Office 기록');
        if (view.showData) {
          if (more && page) {
            const rows = chat() ? 'meetings' : 'items', id = chat() ? 'meetingId' : 'requestId';
            const existing = new Set(page[rows].map(i => i[id]));
            if (res.data[rows].some(i => existing.has(i[id]))) view = M.envelope.describeRead({ kind: 'invalid' }, 'Office 기록');
            else page = { ...res.data, [rows]: [...page[rows], ...res.data[rows]] };
          } else page = res.data;
          synced = new Date();
        } else page = null;
        render();
        if (!view.showData || !selected.id) return;
        const item = chat() ? { meetingId: selected.id } : page.items.find(i => i.requestId === selected.id);
        if (item) await readSelected(item);
      }
      async function send() {
        if (!chat() || ctx.state.hubStatus !== 'connected' || busy || loading || activePending() || unresolvedMeeting() || !editor.value.trim() || editor.value.length > 6000 || (view && !view.showData)) return;
        const message = editor.value.trim(); busy = true; const ticket = ++seq; saveDraft(); render();
        if (!selected.id) {
          const id = crypto.randomUUID();
          if (!await preparePending({ origin, scope: selected.scope, id, ownerId, phase: 'create', message })) return;
          if (!alive || ticket !== seq) { savePending(null); busy = false; if (alive) render(); return; }
          selected.id = id;
          drafts[key()] = message; B.store.set('petOffice.drafts', drafts);
          const res = await B.invoke('pet:office-create', { id, scope: selected.scope, title: message.slice(0, 200), ownerId });
          if (!alive) return;
          if (ticket !== seq) { busy = false; render(); return; }
          view = M.envelope.describeRead(res, '대화 저장');
          if (!view.showData) { busy = false; render(); return; }
          detail = res.data; savePending(null);
          drafts[`${origin}|${selected.scope}|new`] = ''; B.store.set('petOffice.drafts', drafts);
        }
        if (!detail?.meeting || detail.meeting.state === 'closed') { busy = false; render(); return; }
        const command = { id: selected.id, scope: selected.scope, requestId: crypto.randomUUID(), revision: detail.meeting.revision, message };
        if (!await preparePending({ ...command, origin, phase: 'send', draftText: editor.value })) return;
        if (!alive || ticket !== seq) { savePending(null); busy = false; if (alive) render(); return; }
        const observation = D.begin(diagnostic, new Date().toISOString()); diagnostic = observation.state;
        const res = await B.invoke('pet:office-send', command);
        if (!alive) return;
        if (ticket !== seq) { busy = false; render(); return; }
        busy = false; view = M.envelope.describeRead(res, 'Office 답변');
        // Only the transport's verified preclaim failures prove this ID was not
        // accepted. Keep the draft and require refresh plus another explicit send.
        const observed = D.finish(diagnostic, observation.ticket, res, new Date().toISOString());
        // Sending can establish an observation, but it is not a diagnostic GET attempt.
        diagnostic = { ...observed.state, lastAttempt: null };
        if (res.kind === 'conflict' && ['meeting-revision-changed', 'meeting-closed'].includes(res.error)) { savePending(null); diagnostic = null; }
        if (view.showData && observed.apply) { detail = res.data; reconcile(); synced = new Date(); }
        // Ambiguous outcomes keep both draft and command. Recovery is GET only.
        render();
      }
      async function recoverCreate() {
        if (busy || !pendingHere() || pending.phase !== 'create' || ctx.state.hubStatus !== 'connected') return;
        const command = pending, ticket = ++seq;
        busy = true; render();
        // Creation is idempotent and never generates a reply. Sending remains a separate click.
        const res = await B.invoke('pet:office-create', { id: command.id, scope: command.scope,
          title: command.message.slice(0, 200), ownerId: command.ownerId });
        if (!alive) return;
        busy = false;
        if (ticket !== seq) { render(); return; }
        view = M.envelope.describeRead(res, '대화 저장');
        if (view.showData) { detail = res.data; savePending(null); }
        render();
      }
      render();
      Promise.all([B.store.get('petOffice.drafts'), B.store.get('petOffice.pending')]).then(([savedDrafts, savedPending]) => {
        if (!alive) return;
        drafts = { ...(savedDrafts && typeof savedDrafts === 'object' && !Array.isArray(savedDrafts) ? savedDrafts : {}), ...drafts };
        pending = savedPending && typeof savedPending === 'object' ? savedPending : null;
        if (pending?.origin === origin) Object.assign(selected, { tab: 'chat', scope: pending.scope, id: pending.id });
        editor.value = drafts[key()] || (pendingHere() ? pending.message || '' : '');
        ensureDiagnostic();
        tabs.select(selected.tab); scope.select(selected.scope); refresh();
      });
      const timer = setInterval(() => {
        if (!ctx.isShown() || busy || loading) return;
        if (activePending() || unresolvedMeeting()) {
          // Update age without replacing a focused disclosure or performing a GET.
          if (diagnosticHere() && diagnosticSummary) {
            const status = D.describe(diagnostic);
            diagnosticSummary.textContent = `요청 진단 · ${status.label}${status.stale ? ' · 이전 관측' : ''}`;
          }
          return;
        }
        refresh();
      }, C.LIMITS.pollMs);
      return {
        el, refresh, primary: () => chat() ? send() : ctx.openHub(hubPath()),
        focus() { if (chat()) editor.focus(); },
        onState(state, previous) {
          if (state.hubUrl !== origin || (previous && (state.hubStatus !== previous.hubStatus || state.accountId !== previous.accountId))) {
            const sameSession = state.hubUrl === origin && state.accountId === previous?.accountId
              && ['connected', 'offline'].includes(state.hubStatus) && ['connected', 'offline'].includes(previous?.hubStatus);
            saveDraft(); origin = state.hubUrl; seq++; connectionGeneration++; diagnosticOpen = false; loading = false; page = null;
            if (sameSession && diagnostic) {
              diagnostic = D.blocked({ ...diagnostic, target: { ...diagnostic.target, connection: connectionGeneration } }, new Date().toISOString(), state.hubStatus === 'offline' ? 'offline' : 'context-changed');
            } else { diagnostic = null; detail = null; synced = null; historyStale = false; }
            ensureDiagnostic();
            editor.value = drafts[key()] || '';
            view = connectionView(); render();
          }
        },
        onHubStatus(status, before) { if (status === 'connected' && before !== 'connected' && !busy) refresh(); },
        destroy() { saveDraft(); alive = false; seq++; clearInterval(timer); },
      };
    },
  };
})();
