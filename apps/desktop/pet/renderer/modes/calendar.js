// 일정 — 월요일 시작 7일 띠, 날짜를 눌러 그날의 시간(HH:mm·종일)·제목·장소. 편집은 Hub 에서.
// 고른 날짜는 패널을 다시 열어도 유지한다(모듈 안에 보관). 주가 바뀌면 그 주를 다시 읽는다.
'use strict';
(function () {
  const Modes = (window.PetModes = window.PetModes || {});
  let selected = null; // 패널을 접었다 열어도 같은 날을 보여 준다

  Modes.calendar = {
    create(ctx) {
      const { C, B, U, M } = ctx;
      const K = M.calendar;
      const E = M.envelope;
      const h = U.h;

      if (!selected) selected = K.startOfDay(new Date());
      let events = [];
      let dropped = 0;
      let view = null;
      let loading = false;
      let loadedWeek = null;
      let loadedAt = null;
      let alive = true;
      let requestSeq = 0;

      const week = h('div', { class: 'week', role: 'group', 'aria-label': '이번 주 날짜' });
      const scroll = h('div', { class: 'scroll', role: 'region', 'aria-label': '그날 일정' });
      const status = h('span', { class: 'status' });
      const refresh = M.platform.isMac() ? U.quiet('', { icon: 'refresh', iconSize: 14, title: 'Hub 새로고침',
        onClick: () => { if (!loading) load(); } }) : null;
      const footer = h('div', { class: 'footer' }, status,
        U.quiet('Hub에서 열기', { icon: 'arrowUpRight', iconSize: 12, iconAfter: true, title: '일정 편집은 Hub에서 해요', onClick: () => ctx.openHub(C.HUB_PATHS.calendar) }));
      if (refresh) footer.insertBefore(refresh, footer.lastChild);
      const el = h('section', { class: 'mode calendar', 'aria-label': '일정' }, week, scroll, footer);

      const weekKey = (d) => K.toISODate(K.weekOf(d)[0]);

      function select(date) {
        selected = K.startOfDay(date);
        ctx.setDateLine(K.dateLabel(selected));
        renderWeek();
        if (weekKey(selected) !== loadedWeek) load(); else renderList();
      }

      function renderWeek() {
        U.clear(week);
        const today = new Date();
        for (const d of K.weekOf(selected)) {
          const isToday = K.isSameDay(d, today);
          const on = K.isSameDay(d, selected);
          const b = h('button', {
            type: 'button', class: `day${isToday ? ' today' : ''}`, 'aria-pressed': String(on),
            'aria-label': `${K.dateLabel(d)}${isToday ? ' 오늘' : ''}`, tabindex: on ? '0' : '-1',
          }, h('span', { class: 'wd', text: K.weekdayShort(d) }), h('span', { class: 'dn num', text: String(d.getDate()) }));
          if (on) b.append(h('span', { class: 'mini-rim rim-20', 'aria-hidden': 'true' }));
          b.addEventListener('click', () => select(d));
          b.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              select(K.addDays(selected, e.key === 'ArrowLeft' ? -1 : 1));
              const next = week.querySelector('[aria-pressed="true"]');
              if (next) next.focus();
            }
          });
          week.append(b);
        }
      }

      async function load() {
        const seq = ++requestSeq;
        const key = weekKey(selected);
        loading = true;
        renderList();
        const res = await B.invoke('pet:calendar-week', { dateISO: K.toISODate(selected) });
        if (!alive || seq !== requestSeq) return;
        loading = false;
        view = E.describeRead(res, '일정');
        if (view.showData) {
          const data = (res && res.data) || {};
          if (Array.isArray(data.events)) {
            const n = K.normalizeEvents(data.events);
            events = n.events;
            dropped = n.dropped;
            if ((dropped > 0 || data.status === 'partial') && view.state === 'live') view = E.describeRead({ kind: 'partial' }, '일정');
            loadedWeek = key;
            loadedAt = new Date();
          } else {
            view = E.describeRead({ kind: 'invalid' }, '일정');
          }
        }
        renderList();
      }

      function renderList() {
        if (refresh) refresh.disabled = loading;
        U.clear(scroll);
        const failed = view && !view.showData;
        const current = loadedWeek === weekKey(selected);
        if (loading && !current) {
          scroll.append(U.skeleton(3));
        } else {
          if (view && view.state !== 'live') scroll.append(U.notice(view, (a) => ctx.handleAction(a, load), { compact: view.state === 'partial' }));
          if (current && !(failed && !events.length)) {
            const list = K.eventsOn(events, selected);
            if (!list.length && !failed) {
              scroll.append(h('div', { class: 'cal-empty' },
                h('div', { class: 'big', text: '이날 예정된 일정이 없어요.' }),
                h('div', { class: 'small', text: K.dateLabel(selected) })));
            }
            for (const ev of list) {
              const body = h('div', { class: 'body' }, h('div', { class: 'et', text: ev.title }));
              if (ev.location) body.append(h('div', { class: 'loc' }, U.icon('mappin', 11), h('span', { text: ev.location })));
              scroll.append(h('div', { class: 'row event-row', role: 'listitem' },
                h('span', { class: `time${ev.allDay ? '' : ' mono'}`, text: K.timeLabel(ev) }), body));
            }
          }
        }
        status.textContent = statusLabel();
      }

      function statusLabel() {
        if (loading) return 'Hub 새로고침 중…';
        if (!view) return '';
        if (view.state === 'live') return loadedAt && Date.now() - loadedAt < 60000 ? '방금 동기화' : `${U.clock(loadedAt)} 동기화`;
        if (view.state === 'partial') return dropped ? `일부만 확인 · 읽지 못한 일정 ${dropped}개` : '일부만 확인';
        return view.label;
      }

      function moveWeek(n) { select(K.shiftWeek(selected, n)); }

      ctx.setDateLine(K.dateLabel(selected));
      renderWeek();
      load();
      const timer = setInterval(() => { if (ctx.isShown()) load(); }, C.LIMITS.pollMs);

      return {
        el,
        focus() { const b = week.querySelector('[aria-pressed="true"]'); if (b) b.focus(); },
        refresh: load,
        primary() { ctx.openHub(C.HUB_PATHS.calendar); },
        menuItems() {
          return [
            { label: '오늘', icon: 'calendar', onSelect: () => select(new Date()) },
            { label: '이전 주', icon: 'chevronLeft', onSelect: () => moveWeek(-1) },
            { label: '다음 주', icon: 'chevronRight', onSelect: () => moveWeek(1) },
            { label: '다시 불러오기', icon: 'refresh', onSelect: load },
            { label: 'Hub에서 일정 편집', icon: 'arrowUpRight', onSelect: () => ctx.openHub(C.HUB_PATHS.calendar) },
          ];
        },
        onHubStatus(s, before) { if (s === 'connected' && before !== 'connected') load(); },
        onWindowFocus() { if (!loading && (!loadedAt || Date.now() - loadedAt > 20000)) load(); },
        destroy() { alive = false; clearInterval(timer); },
      };
    },
  };
  // 알림에서 특정 날짜로 열 때(셸이 모드를 calendar 로 바꾸기 전에 부른다).
  Modes.calendar.selectDate = (iso) => {
    const d = window.PetModel.calendar.parseDate(iso, true);
    if (d) selected = d;
  };
})();
