"use client";

import React from "react";
import { Button, EmptyState, IconButton, SegmentedControl, Skeleton, TruthBadge } from "./hub-primitives";
import { StreakMark } from "./burning-streak";
import { RITUAL_CATEGORY_LABELS } from "@/lib/rhythm-ui";
import { buildRhythmBars, RHYTHM_HISTORY_RANGE_LABELS, RHYTHM_HISTORY_RANGES } from "@/lib/rhythm-history";
import "./rhythm-history.css";

/**
 * 리듬 기록 — 주·월·분기·연 단위로 내 루틴을 어떻게 해 왔는지 본다.
 *
 * 데이터는 /api/hub/rhythm-history 하나(루틴 완료만, 할 일 없음). 날짜 칸의 진하기는 그날 매일
 * 루틴을 얼마나 채웠는지(0~4단계)이고, 한 가지 명도 램프(--fg를 surface에 섞은 단계)만 쓴다 —
 * 색상(hue)은 쓰지 않는다(§5.3 charts: Moonstone luminance). 모든 칸은 날짜·완료 수를 텍스트로
 * 갖고(title·aria-label), 루틴별 목록이 같은 정보를 숫자로 다시 보여 준다(표 보기 역할).
 */

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const RANGE_STORAGE_KEY = "mlp.rhythmHistoryRange";

function readStoredRange() {
  try {
    const v = window.localStorage.getItem(RANGE_STORAGE_KEY);
    return RHYTHM_HISTORY_RANGES.includes(v) ? v : "week";
  } catch {
    return "week";
  }
}

function dayTitle(day) {
  const [, m, d] = day.dateKey.split("-").map(Number);
  if (day.future) return `${m}월 ${d}일 · 아직`;
  return `${m}월 ${d}일 · ${day.done}/${day.due} 완료`;
}

function streakLevel(days) {
  if (days >= 14) return 4;
  if (days >= 7) return 3;
  if (days >= 3) return 2;
  if (days >= 1) return 1;
  return 0;
}

function useRhythmHistory({ range, offset, projectId, version }) {
  const [state, setState] = React.useState({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, status: prev.data && prev.data.history?.window?.range === range ? "refreshing" : "loading" }));
    const qs = new URLSearchParams({ range, offset: String(offset) });
    if (projectId) qs.set("project", projectId);
    fetch(`/api/hub/rhythm-history?${qs}`, { cache: "no-store" })
      .then((response) => response.json().catch(() => null).then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!active) return;
        // 허브 read 봉투 — HTTP 200이어도 status:'error'면 실패다(CLAUDE.md).
        if (!response.ok || !data || data.status === "error" || data.source === "error") {
          setState({ status: "error", data: null, error: data?.error || `기록 응답 실패 (${response.status})` });
          return;
        }
        if (data.status === "preview" || !data.history) {
          setState({ status: "preview", data: null, error: null });
          return;
        }
        setState({ status: data.status === "partial" ? "partial" : "live", data, error: null });
      })
      .catch((error) => active && setState({ status: "error", data: null, error: error instanceof Error ? error.message : String(error) }));
    return () => { active = false; };
    // version은 오늘 체크가 서버에 반영될 때 바뀐다 — 지금 기간만 다시 읽으면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, offset, projectId, attempt, offset === 0 ? version : null]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

function HeatCell({ day }) {
  if (!day) return <span className="hub-rh-cell hub-rh-cell--void" aria-hidden="true" />;
  return (
    <span
      className="hub-rh-cell"
      data-level={day.level}
      data-future={day.future ? "true" : "false"}
      data-today={day.isToday ? "true" : "false"}
      title={dayTitle(day)}
      aria-label={dayTitle(day)}
      role="img"
    />
  );
}

function Legend() {
  return (
    <div className="hub-rh-legend" aria-hidden="true">
      <span>적음</span>
      {[0, 1, 2, 3, 4].map((level) => <span key={level} className="hub-rh-cell hub-rh-cell--legend" data-level={level} />)}
      <span>매일 루틴 모두</span>
    </div>
  );
}

// 주: 루틴 × 7일 — 어떤 루틴을 어느 날 했는지 그대로.
function WeekMatrix({ history }) {
  return (
    <div className="hub-rh-week" role="table" aria-label="이번 기간 루틴별 체크">
      <div className="hub-rh-week__row hub-rh-week__row--head" role="row">
        <span role="columnheader" className="hub-rh-muted">루틴</span>
        {history.days.map((day) => (
          <span key={day.dateKey} role="columnheader" className="hub-rh-week__day" data-today={day.isToday ? "true" : "false"}>
            {WEEKDAYS[day.weekday]}
            <span className="mono">{Number(day.dateKey.slice(8))}</span>
          </span>
        ))}
      </div>
      {history.rituals.map((r) => {
        const done = new Set(r.doneKeys);
        return (
          <div key={r.id} className="hub-rh-week__row" role="row">
            <span role="rowheader" className="hub-rh-week__name">{r.name}</span>
            {history.days.map((day) => {
              const on = done.has(day.dateKey);
              const label = `${r.name} ${dayTitle(day).split(" · ")[0]} ${day.future ? "아직" : on ? "완료" : "안 함"}`;
              return (
                <span key={day.dateKey} role="cell" className="hub-rh-mark" data-on={on ? "true" : "false"} data-future={day.future ? "true" : "false"} title={label} aria-label={label}>
                  {on ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// 월: 달력 — 날짜 숫자 + 진하기.
function MonthCalendar({ history }) {
  return (
    <div className="hub-rh-month">
      <div className="hub-rh-month__head" aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      {history.weeks.map((week, i) => (
        <div key={i} className="hub-rh-month__week">
          {week.map((day, j) => (day ? (
            <span
              key={day.dateKey}
              className="hub-rh-cell hub-rh-cell--day"
              data-level={day.level}
              data-future={day.future ? "true" : "false"}
              data-today={day.isToday ? "true" : "false"}
              title={dayTitle(day)}
              aria-label={dayTitle(day)}
              role="img"
            >
              <span className="mono">{Number(day.dateKey.slice(8))}</span>
            </span>
          ) : <span key={`v${j}`} className="hub-rh-cell hub-rh-cell--void" aria-hidden="true" />))}
        </div>
      ))}
    </div>
  );
}

// 분기·연: 주 단위 열 × 요일 행의 잔디 격자 + 월별 막대.
function YearGrid({ history, cell }) {
  // 각 열(주)의 첫 날이 새 달의 시작을 품으면 그 위에 달 이름을 단다.
  const monthLabels = history.weeks.map((week, i) => {
    const first = week.find(Boolean);
    const prev = i > 0 ? history.weeks[i - 1].find(Boolean) : null;
    if (!first) return "";
    const m = first.dateKey.slice(5, 7);
    return !prev || prev.dateKey.slice(5, 7) !== m ? `${Number(m)}월` : "";
  });
  // 좁은 화면에서 격자가 넘치면 오늘(또는 기간 끝) 쪽이 보이게 한 번 끝으로 민다.
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const today = el.querySelector('[data-today="true"]');
    el.scrollLeft = today ? Math.max(0, today.offsetLeft - el.clientWidth + 48) : el.scrollWidth;
  }, [history.window.startKey]);
  return (
    <>
      <div className="hub-rh-scroll" ref={scrollRef}>
        <div className="hub-rh-grid" style={{ "--rh-cell": `${cell}px` }}>
          <div className="hub-rh-grid__months" aria-hidden="true">
            <span />
            {monthLabels.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className="hub-rh-grid__body">
            <div className="hub-rh-grid__weekdays" aria-hidden="true">
              {WEEKDAYS.map((w, i) => <span key={w}>{i % 2 === 0 ? w : ""}</span>)}
            </div>
            {history.weeks.map((week, i) => (
              <div key={i} className="hub-rh-grid__col">
                {week.map((day, j) => <HeatCell key={day ? day.dateKey : `v${j}`} day={day} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Legend />
      <RhythmBars history={history} />
    </>
  );
}

// 막대 차트 — 연은 월별, 분기는 주별. 값 = 매일 루틴을 채운 칸의 비율.
// 표식 규칙(dataviz): 막대 폭 ≤ 24px·끝만 4px 둥글게·바닥은 각지게, 1px 실선 격자, 평균은 점선
// 기준선 하나, 숫자는 이번 기간과 최고 기간에만 직접 달고 나머지는 툴팁·aria가 맡는다.
// 색은 명도만: 지난 기간 --fg-muted, 이번 기간·가리킨 막대 --fg(§5.3 charts).
function RhythmBars({ history }) {
  const { buckets, average } = buildRhythmBars(history);
  if (!buckets.length) return null;
  const unit = history.window.range === "year" ? "월" : "주";
  const summary = buckets.filter((b) => b.rate !== null).map((b) => `${b.longLabel} ${b.rate}%`).join(", ");
  return (
    <figure className="hub-rh-bars" aria-label={`${unit}별 달성률${average !== null ? `, 평균 ${average}%` : ""}: ${summary || "기록 없음"}`}>
      <figcaption className="hub-rh-bars__caption">
        <span>{unit}별 달성률</span>
        {average !== null && (
          <span className="hub-rh-bars__avg-key">
            <span className="hub-rh-bars__avg-swatch" aria-hidden="true" />
            평균 <span className="num">{average}%</span>
          </span>
        )}
      </figcaption>
      <div className="hub-rh-bars__plot">
        <div className="hub-rh-bars__axis" aria-hidden="true">
          {[100, 50, 0].map((t) => <span key={t} className="mono" style={{ bottom: `${t}%` }}>{t}%</span>)}
        </div>
        <div className="hub-rh-bars__area">
          {[0, 50, 100].map((t) => (
            <span key={t} className="hub-rh-bars__grid" data-base={t === 0 ? "true" : "false"} style={{ bottom: `${t}%` }} aria-hidden="true" />
          ))}
          {average !== null && (
            <span className="hub-rh-bars__avg" style={{ bottom: `${average}%` }} aria-hidden="true" />
          )}
          <div className="hub-rh-bars__cols" key={history.window.startKey}>
            {buckets.map((b, i) => {
              const label = b.future ? `${b.longLabel} · 아직` : `${b.longLabel} · ${b.rate ?? 0}% (매일 루틴 ${b.done}/${b.due}칸)`;
              // 이번 기간·최고 기간만 숫자를 늘 보이고, 나머지는 가리킬 때 CSS가 드러낸다.
              const pinned = b.current || b.isBest;
              return (
                <div
                  key={b.key}
                  className="hub-rh-bars__col"
                  data-current={b.current ? "true" : "false"}
                  data-future={b.future ? "true" : "false"}
                  style={{ "--i": Math.min(i, 12) }}
                  role="img"
                  tabIndex={b.future ? -1 : 0}
                  aria-label={label}
                >
                  {/* 캡슐 트랙: 100%까지의 빈 기둥 안을 막대가 채운다. 미래 기간은 점선 빈 트랙만. */}
                  <span className="hub-rh-bars__track" aria-hidden="true">
                    {!b.future && (
                      <span className="hub-rh-bars__bar" style={{ height: `${Math.max(b.rate ?? 0, b.rate ? 3 : 0)}%` }}>
                        {b.rate !== null && (
                          <span className="hub-rh-bars__value num" data-pinned={pinned ? "true" : "false"}>{b.rate}%</span>
                        )}
                      </span>
                    )}
                  </span>
                  {!b.future && (
                    <span className="hub-rh-bars__tip" aria-hidden="true">
                      <strong>{b.longLabel}</strong>
                      <span><span className="num">{b.rate ?? 0}%</span> · 매일 루틴 <span className="num">{b.done}/{b.due}</span>칸</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="hub-rh-bars__labels" aria-hidden="true">
        <span />
        <div>
          {buckets.map((b, i) => (
            <span key={b.key} data-current={b.current ? "true" : "false"}>
              {unit === "주" && buckets.length > 8 && i % 2 === 1 && !b.current ? "" : b.label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function RitualRates({ history }) {
  return (
    <ul className="hub-rh-rates" aria-label="루틴별 달성">
      {history.rituals.map((r) => (
        <li key={r.id} className="hub-rh-rates__row">
          <div className="hub-rh-rates__text">
            <span className="hub-rh-rates__name">{r.name}</span>
            <span className="hub-rh-muted">
              {RITUAL_CATEGORY_LABELS[r.category] || RITUAL_CATEGORY_LABELS.general}
              {" · "}
              {r.daily ? "매일" : `주 ${r.target}회`}
              {r.bestRun >= 2 ? ` · 최장 ${r.bestRun}일 연속` : ""}
            </span>
          </div>
          <span className="hub-rh-rates__bar" aria-hidden="true"><span style={{ width: `${r.rate ?? 0}%` }} /></span>
          <span className="hub-rh-rates__value">
            <span className="num">{r.rate === null ? "–" : `${r.rate}%`}</span>
            <span className="hub-rh-muted mono">{r.doneCount}/{r.expected}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RhythmHistory({ projectId = null, version = "" }) {
  const [range, setRange] = React.useState("week");
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setRange(readStoredRange()); }, []);
  const changeRange = (next) => {
    setRange(next);
    setOffset(0);
    try { window.localStorage.setItem(RANGE_STORAGE_KEY, next); } catch { /* 저장 불가 — 기본값으로 */ }
  };
  const { status, data, error, retry } = useRhythmHistory({ range, offset, projectId, version });
  const history = data?.history || null;
  const window_ = history?.window;
  const summary = history?.summary;

  return (
    <section className="fx-card hub-rh" aria-labelledby="rhythm-history-title">
      <header className="hub-rh__head">
        <div>
          <div className="fx-eyebrow">리듬 기록</div>
          <h3 id="rhythm-history-title" className="hub-rh__title">내 루틴을 어떻게 해 왔나</h3>
        </div>
        <SegmentedControl
          value={range}
          onChange={changeRange}
          options={RHYTHM_HISTORY_RANGES.map((key) => ({ key, label: RHYTHM_HISTORY_RANGE_LABELS[key] }))}
          label="기록 기간 단위"
        />
      </header>

      <div className="hub-rh__nav">
        <IconButton icon="chevronL" size={36} tooltip="이전 기간" onClick={() => setOffset((o) => o - 1)} />
        <span className="hub-rh__period" aria-live="polite">{window_?.label || " "}</span>
        <IconButton icon="chevronR" size={36} tooltip="다음 기간" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} />
        {offset < 0 && <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>지금으로</Button>}
        {status === "partial" && <TruthBadge state="partial" />}
        {status === "preview" && <TruthBadge state="preview" />}
      </div>

      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton lines={1} height={64} label="리듬 기록 불러오는 중" />
          <Skeleton lines={4} height={20} label="리듬 기록 불러오는 중" />
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="hub-rh__alert">
          <TruthBadge state="error" />
          <span>리듬 기록을 읽지 못했습니다. {error || ""}</span>
          <Button variant="secondary" size="sm" onClick={retry}>다시 읽기</Button>
        </div>
      )}

      {status === "preview" && (
        <EmptyState icon="rhythm" title="아직 기록을 읽을 저장소가 없습니다" description="Supabase가 연결되면 주·월·분기·연 단위 루틴 기록이 여기에 쌓입니다." style={{ minHeight: 160 }} />
      )}

      {history && (status === "live" || status === "partial" || status === "refreshing") && (
        history.rituals.length === 0 ? (
          <EmptyState icon="rhythm" title="이 기간의 루틴 기록이 없습니다" description="루틴을 체크하면 날마다 여기에 쌓입니다." style={{ minHeight: 160 }} />
        ) : (
          <div className="hub-rh__body" data-refreshing={status === "refreshing" ? "true" : "false"}>
            <div className="hub-rh__stats">
              <div className="hub-rh__stat">
                <span className="hub-rh-muted">달성률</span>
                <span className="stat hub-rh__stat-value">{summary.rate === null ? "–" : `${summary.rate}%`}</span>
                <span className="hub-rh-muted">완료 <span className="num">{summary.totalDone}</span> / 목표 <span className="num">{summary.totalExpected}</span></span>
              </div>
              <div className="hub-rh__stat">
                <span className="hub-rh-muted">다 해낸 날</span>
                <span className="stat hub-rh__stat-value">{summary.perfectDays}<span className="hub-rh__unit">일</span></span>
                <span className="hub-rh-muted">체크한 날 <span className="num">{summary.activeDays}</span> / <span className="num">{summary.pastDays}</span>일</span>
              </div>
              <div className="hub-rh__stat">
                <span className="hub-rh-muted">최장 연속</span>
                <span className="stat hub-rh__stat-value" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <StreakMark size={18} level={streakLevel(summary.bestRun.days)} />
                  {summary.bestRun.days}<span className="hub-rh__unit">일</span>
                </span>
                <span className="hub-rh-muted">{summary.bestRun.name || "기록 없음"}</span>
              </div>
              <div className="hub-rh__stat">
                <span className="hub-rh-muted">가장 꾸준한 루틴</span>
                <span className="hub-rh__stat-name">{summary.steadiest?.name || "–"}</span>
                <span className="hub-rh-muted">{summary.steadiest ? `${summary.steadiest.rate}% 달성` : ""}</span>
              </div>
            </div>

            {window_.range === "week" && <WeekMatrix history={history} />}
            {window_.range === "month" && <MonthCalendar history={history} />}
            {window_.range === "quarter" && <YearGrid history={history} cell={16} />}
            {window_.range === "year" && <YearGrid history={history} cell={11} />}
            {window_.range === "month" && <Legend />}

            <RitualRates history={history} />
          </div>
        )
      )}
    </section>
  );
}
