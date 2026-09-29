"use client";

// 오늘 연락 — 영업·매출의 첫 탭(2026-09-24 운영자 승인 목업 01, Futura 텍스처).
//
// "CRM을 만들지 않는다. 약속 기록을 지킨다." 매일 필요한 것은 셋뿐이다(스펙 §0.5):
// 오늘 누구에게 연락하나 · 연락 뒤 30초 기록 · 놓친 약속이 몇 건인가. 약속 = next_action(무엇)
// + meta.next_action_at(언제) + dormant(기약 없음). 화면은 그 순서로만 선다:
//   놓친 약속(빨강은 여기 한 곳) → 기록할까요(캘린더·통화 후보) → 오늘 약속 → 접힌 나머지.
// 다른 고객은 스크롤하지 않고 검색(/)으로 고객 탭에서 찾는다. 오른쪽 레일은 매출이 아니라
// 습관 지표(놓친 약속 0 · 기록 = 연락 · 기록 1건 30초)이고, 전부 기록에서 센 숫자다.
//
// 예전 이 화면(고객 연락)의 레인 필터(리드/딜/일정)·활동 패널·메시지 초안 드로어는 뺐다 —
// 레인은 행 안의 단계로, 최근 기록·답장 초안은 이름을 눌러 여는 고객 상세에 이미 있다.

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Avatar, Button, DateQuickPresets, EmptyState, Input, Kbd, Skeleton, TextField, TruthBadge, useToast } from "../hub-primitives";
import { ContactRecordDrawer } from "../contact-record-form";
import { RecordCandidates, resolveRecordCandidate } from "../record-candidates";
import { SuggestionTip } from "../suggestion-tip";
import { TIP_RULE_IDS, nudgeTipReason, useCrmNudges } from "../crm-nudge";
import { KIND_LABEL, REACTION_LABEL } from "@/lib/sales-os/followup-scoring";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { DEAL_STAGES, STAGE_ALIASES } from "@/lib/deal-stages";
import { MAX_DANGER_RAILS, groupFollowups } from "@/lib/sales-os/followup-groups";
import { diffKstDays, kstDayKey } from "@/lib/kst-day";
import "./today-contact.css";

// Small, duplicated on purpose (not imported from ./revenue): that page is its own lazy-loaded
// route chunk, and a static cross-import here pulled its entire ~1400-line module into this
// chunk too, which broke Turbopack's dev chunk graph outright (page hung on the loading
// fallback, no console error).
const STAGE_BY_KEY = Object.fromEntries(DEAL_STAGES.map((s) => [s.key, s]));
const LEAD_STATUS_LABEL = { new: "신규", qualified: "검증", nurturing: "연락 중", won: "고객" };
function stageLabel(item) {
  if (item.kind === "lead") return LEAD_STATUS_LABEL[item.stage] || null;
  const key = STAGE_ALIASES[item.stage] || item.stage;
  return STAGE_BY_KEY[key]?.label || null;
}
const KIND_TAG = { lead: "리드", deal: "거래", account: "계약 고객" };

// 행이 제안하는 채널(followups-ledger channelFor) → 30초 기록 시트의 채널 키. 방문은 시트에서
// 미팅이 대신한다(스펙 §4.3의 "미팅·데모·방문" 한 묶음).
const CHANNEL_PRESET = { "카톡": "kakao", "방문": "meeting", "전화/문자": "call", "문자/전화": "call", "스레드 DM": "kakao" };
const CHANNEL_ICON = { "카톡": "chat", "스레드 DM": "chat", "방문": "building", "전화/문자": "signal", "문자/전화": "signal" };
// 기록 후보의 채널(record-candidates 계약) → 시트 채널. 문자는 카톡·문자 칸이다.
const CANDIDATE_CHANNEL = { meeting: "meeting", call: "call", sms: "kakao", kakao: "kakao" };

const SOURCE_LABEL = {
  leads: "리드",
  deals: "거래",
  companies: "학원 정보",
  crm_activities: "최근 기록",
  promises: "다가오는 약속",
  week_activities: "이번 주 기록",
};

const rowKey = (item) => `${item.kind}:${item.id}`;
const kbId = (item) => `${item.kind}-${item.id}`;

// ── 날짜 문구 (KST) ──────────────────────────────────────────────────────────
const KST_PARTS = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" });
function kstParts(date) {
  return Object.fromEntries(KST_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
}
function headerDate(now = new Date()) {
  const p = kstParts(now);
  return `${p.month}월 ${p.day}일 ${p.weekday}`;
}
// day-key(YYYY-MM-DD) 또는 ISO → "9/22" · "9/25 금"
function shortDate(value, { weekday = false } = {}) {
  const key = kstDayKey(value);
  if (!key) return "";
  const p = kstParts(new Date(`${key}T12:00:00+09:00`));
  return weekday ? `${p.month}/${p.day} ${p.weekday}` : `${p.month}/${p.day}`;
}
function formatWon(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return null;
  if (n >= 1e6) return `₩${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₩${Math.round(n / 1e3)}K`;
  return `₩${n}`;
}

// ── 데이터 ───────────────────────────────────────────────────────────────────
// 모듈 스코프 SWR(7차 속도): 코어 데일리 표면이라 탭 복귀마다 스켈레톤을 반복하지 않는다 —
// 5분 내 캐시를 즉시 서빙하고 항상 배경 재검증한다. 재검증 실패는 error로 명명한다 —
// 오래된 데이터를 live로 위장하지 않는다.
const FOLLOWUPS_CACHE_SERVABLE_MS = 5 * 60 * 1000;
const FOLLOWUPS_URL = "/api/hub/followups?limit=80";
const EMPTY_STATE = { syncState: "loading", items: [], upcoming: [], dormant: [], week: null, summary: {}, failedSources: [] };
let followupsCache = null; // { at, state }

function useFollowups() {
  const cached = followupsCache && Date.now() - followupsCache.at < FOLLOWUPS_CACHE_SERVABLE_MS
    ? followupsCache.state
    : null;
  const [state, setState] = React.useState(cached || EMPTY_STATE);
  // 새로고침·기록 후 reload가 겹치면 늦게 온 이전 응답이 최신 목록을 덮을 수 있다 —
  // 요청 id로 최신 요청만 반영한다(re-audit S13).
  const requestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const isCurrent = () => requestRef.current === requestId;
    // 캐시 서빙 중에는 로딩 스켈레톤으로 갈아치우지 않는다 — 조용한 재검증.
    const servable = followupsCache && Date.now() - followupsCache.at < FOLLOWUPS_CACHE_SERVABLE_MS;
    if (!servable) setState((s) => ({ ...s, syncState: "loading" }));
    try {
      const r = await fetch(FOLLOWUPS_URL, { cache: "no-store" });
      if (!isCurrent()) return;
      const d = await r.json().catch(() => null);
      if (!isCurrent()) return;
      // 허브 read 계약: 실패도 HTTP 200 + status:"error"다 — !r.ok만 보면 빈 목록으로 위장된다.
      if (!r.ok || !d || d.status === "error") {
        setState((s) => ({ ...s, syncState: "error" }));
        return;
      }
      const next = {
        // partial = 일부 소스 read 실패 — live로 뭉개지 않고 배지로 표시한다(§5.3).
        syncState: d.status === "live" ? "live" : d.status === "partial" ? "partial" : "preview",
        items: Array.isArray(d.items) ? d.items : [],
        upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
        dormant: Array.isArray(d.dormant) ? d.dormant : [],
        week: d.week && typeof d.week === "object" ? d.week : null,
        summary: d.summary || {},
        failedSources: [
          ...(Array.isArray(d.failedSources) ? d.failedSources : []),
          ...(Array.isArray(d.auxiliaryFailedSources) ? d.auxiliaryFailedSources : []),
        ],
      };
      followupsCache = { at: Date.now(), state: next };
      setState(next);
    } catch {
      if (isCurrent()) setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

async function searchContactTargets(q) {
  try {
    const r = await fetch(`/api/hub/followups/targets?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!d || d.status === "error") return { status: "error", targets: [] };
    return { status: d.status || "error", targets: Array.isArray(d.targets) ? d.targets : [] };
  } catch {
    return { status: "error", targets: [] };
  }
}

function targetOf(item) {
  return { kind: item.kind, id: item.id, companyId: item.companyId || null, name: item.name, org: item.company || null };
}

// ── 행 ───────────────────────────────────────────────────────────────────────
function lastContactLine(item) {
  if (!item.lastContactAt) return "기록 없음";
  const kind = KIND_LABEL[item.lastKind] || "";
  const reaction = item.lastReaction ? ` · ${REACTION_LABEL[item.lastReaction] || item.lastReaction}` : "";
  return `마지막 연락 ${shortDate(item.lastContactAt)} ${kind}${reaction}`.trim();
}

function RescheduleChooser({ item, state, onPick, onCancel }) {
  const [at, setAt] = React.useState("");
  const busy = Boolean(state?.busy);
  return (
    <div className="today-contact__resched" role="group" aria-label={`${item.name} 약속 날짜 다시 잡기`}>
      <DateQuickPresets onPick={onPick} disabled={busy} style={{ flexWrap: "wrap" }} />
      <TextField
        label="날짜"
        type="date"
        className="mono"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        fieldStyle={{ flex: "0 1 170px" }}
        style={{ padding: "0 10px" }}
      />
      <Button variant="outline" size="sm" disabled={busy || !at} onClick={() => onPick(at)}>{busy ? "옮기는 중…" : "옮기기"}</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>취소</Button>
      {state?.error && <span role="alert" className="today-contact__resched-error">{state.error}</span>}
    </div>
  );
}

function ContactRow({ item, variant, rail = false, leaving = false, selected = false, todayKey, tip, onNavigate, onRecord, onReschedule, reschedule, onRescheduleOpen, onRescheduleClose }) {
  const org = item.company && item.company !== item.name ? item.company : null;
  const initial = String(org || item.name || "?").trim().slice(0, 1);
  const stage = stageLabel(item);
  const promiseKey = kstDayKey(item.promisedAt);
  const lateDays = variant === "missed" && promiseKey ? diffKstDays(promiseKey, todayKey) : null;
  const amount = item.kind === "deal" ? formatWon(item.amount) : null;
  const rescheduling = reschedule?.key === rowKey(item);

  let promise;
  let why = null;
  if (variant === "missed") {
    promise = item.promiseText || "약속 내용 없음";
    why = promiseKey ? `${shortDate(promiseKey)} 약속` : null;
  } else if (variant === "today") {
    promise = item.promiseText || "오늘 연락하기로 한 날";
  } else if (variant === "upcoming") {
    promise = item.promiseText || "약속";
    why = promiseKey ? shortDate(promiseKey, { weekday: true }) : null;
  } else if (variant === "dormant") {
    promise = "기약 없음";
    why = item.recheck
      ? `${item.dormantDays}일 지남 — 다시 볼까요?`
      : item.dormantDays != null ? `${item.dormantDays}일째` : null;
  } else {
    // 정체로만 올라온 고객 — 약속이 없다. 마지막 연락은 아래 meta 줄이 말한다.
    promise = "다음 약속 비어 있음";
  }

  return (
    <div className="today-contact__row-wrap" data-leaving={leaving ? "true" : "false"} aria-hidden={leaving ? "true" : undefined}>
      <div className="today-contact__row-inner">
        <div
          className="hub-row today-contact__row"
          data-kb-row={kbId(item)}
          data-selected={selected ? "true" : undefined}
          style={{ boxShadow: rail ? "inset 1px 0 0 var(--danger)" : undefined }}
        >
          <Avatar name={initial} tone="neutral" size={32} />
          <div className="today-contact__body">
            <div className="today-contact__who">
              {item.href ? (
                <button type="button" className="today-contact__name" onClick={() => onNavigate?.(item.href)} tabIndex={leaving ? -1 : undefined}>
                  {item.name}
                </button>
              ) : (
                <span className="today-contact__name">{item.name}</span>
              )}
              {org && <span className="today-contact__org">{org}</span>}
            </div>
            <div className="today-contact__promise">
              {promise}
              {why && <span className="today-contact__why"> · {why}</span>}
            </div>
            {tip && (
              <div className="today-contact__tip">
                <SuggestionTip
                  reason={tip.reason}
                  action={tip.action}
                  onAction={tip.onAction}
                  onSnooze={tip.onSnooze}
                  onDismiss={tip.onDismiss}
                />
              </div>
            )}
            <div className="today-contact__meta">
              {lateDays != null && lateDays > 0 && (
                // 레일 예산을 넘긴 '지남' 행은 색 대신 글리프 + 직접 라벨로 같은 사실을 말한다(§5.3).
                <span className="today-contact__late" data-urgent={rail ? "true" : undefined}>
                  <Iconed name="clock" size={11} />
                  <span className="num">{lateDays}일 지남</span>
                </span>
              )}
              {(variant === "missed" || variant === "dormant" || variant === "open") && <span>{lastContactLine(item)}</span>}
              {(variant === "today" || variant === "upcoming") && item.channel && (
                <span className="today-contact__channel">
                  <Iconed name={CHANNEL_ICON[item.channel] || "chat"} size={11} />
                  {item.channel}
                </span>
              )}
              {(variant === "today" || variant === "upcoming") && (stage || KIND_TAG[item.kind]) && (
                <span>{KIND_TAG[item.kind]}{stage ? ` · ${stage}` : ""}{amount ? <> · <span className="mono">{amount}</span></> : null}</span>
              )}
            </div>
          </div>
          <div className="today-contact__acts">
            {variant === "dormant" && item.recheck ? (
              <Button variant="outline" size="sm" onClick={() => (rescheduling ? onRescheduleClose() : onRescheduleOpen(item))} aria-expanded={rescheduling} tabIndex={leaving ? -1 : undefined}>
                시점 정하기
              </Button>
            ) : (
              <Button variant={variant === "missed" || variant === "today" ? "outline" : "ghost"} size="sm" icon="edit" onClick={() => onRecord(item)} tabIndex={leaving ? -1 : undefined}>
                기록
              </Button>
            )}
            {(variant === "missed" || variant === "open") && (
              <Button variant="ghost" size="sm" onClick={() => (rescheduling ? onRescheduleClose() : onRescheduleOpen(item))} aria-expanded={rescheduling} tabIndex={leaving ? -1 : undefined}>
                {variant === "missed" ? "날짜 다시" : "시점 정하기"}
              </Button>
            )}
          </div>
        </div>
        {rescheduling && (
          <RescheduleChooser item={item} state={reschedule} onPick={(at) => onReschedule(item, at)} onCancel={onRescheduleClose} />
        )}
      </div>
    </div>
  );
}

// ── 오른쪽 레일: 이번 주 · 잘 굴러가는지 ─────────────────────────────────────
function WeekRail({ syncState, week, missedCount, dueCount }) {
  const loading = syncState === "loading" && !week;
  const maxDay = Math.max(1, ...(week?.days || []).map((d) => d.count));
  const handled = week?.customersRecordedToday ?? 0;

  return (
    <aside className="today-contact__rail" aria-label="이번 주 연락 습관">
      <section className="fx-card today-contact__card">
        <h3 className="fx-eyebrow today-contact__card-title">이번 주</h3>
        {loading ? (
          <Skeleton lines={3} height={16} label="이번 주 기록 불러오는 중" style={{ marginTop: 12 }} />
        ) : syncState === "preview" ? (
          <div className="today-contact__card-note"><TruthBadge state="preview" /></div>
        ) : !week ? (
          // 주간 읽기 실패를 0으로 그리지 않는다 — "연락 0"은 사실이 아니다.
          <div className="today-contact__card-note" role="alert">
            <TruthBadge state="error" />
            <span>이번 주 기록을 읽지 못했어요.</span>
          </div>
        ) : (
          <>
            <div className="today-contact__kpis">
              <div><div className="stat today-contact__kpi">{week.contacts}</div><span className="today-contact__kpi-label">연락</span></div>
              <div><div className="stat today-contact__kpi">{week.customers}</div><span className="today-contact__kpi-label">고객</span></div>
              <div><div className="stat today-contact__kpi">{missedCount}</div><span className="today-contact__kpi-label">놓친 약속</span></div>
            </div>
            <div
              className="today-contact__bars"
              role="img"
              aria-label={`요일별 연락 수 · ${week.days.map((d) => `${d.label} ${d.count}건`).join(", ")}`}
            >
              {week.days.map((d) => (
                <span key={d.key} className="today-contact__bar" data-today={d.today ? "true" : undefined} data-future={d.future ? "true" : undefined}>
                  {!d.future && d.count > 0 && <i style={{ height: `${Math.max(8, Math.round((d.count / maxDay) * 100))}%` }} />}
                </span>
              ))}
            </div>
            <div className="today-contact__days" aria-hidden="true">
              {week.days.map((d) => <span key={d.key} data-today={d.today ? "true" : undefined}>{d.label}</span>)}
            </div>
            {week.truncated && <TruthBadge state="partial" reason="최근 500건까지만 셌어요" style={{ marginTop: 10 }} />}
          </>
        )}
      </section>

      <section className="fx-card today-contact__card">
        <h3 className="fx-eyebrow today-contact__card-title">잘 굴러가는지</h3>
        {loading ? (
          <Skeleton lines={3} height={12} label="습관 지표 불러오는 중" style={{ marginTop: 12 }} />
        ) : syncState === "preview" || syncState === "error" ? (
          <div className="today-contact__card-note"><TruthBadge state={syncState} /></div>
        ) : (
          <dl className="today-contact__checks">
            <div><dt>놓친 약속</dt><dd className="num">{missedCount}건 → 목표 0</dd></div>
            {/* 오늘 기록한 고객 / (기록한 고객 + 아직 남은 약속). 연락 자체는 셀 수 없어 기록으로 닫은 몫을 본다. */}
            <div><dt>오늘 챙긴 사람</dt><dd className="num">{week ? `${handled} / ${handled + dueCount}` : "—"}</dd></div>
            <div>
              <dt>기록 1건 평균</dt>
              <dd className="num">{week?.recordSeconds ? `${week.recordSeconds.average}초` : "측정 전"}</dd>
            </div>
          </dl>
        )}
      </section>
    </aside>
  );
}

function SectionHead({ title, count, danger = false, hint }) {
  return (
    <div className="today-contact__sec-head">
      <h3 className="fx-eyebrow today-contact__sec-title">{title}</h3>
      <span className="num today-contact__count" data-danger={danger && count > 0 ? "true" : undefined}>{count}</span>
      {hint && <span className="today-contact__hint">{hint}</span>}
    </div>
  );
}

// ── 페이지 ───────────────────────────────────────────────────────────────────
export function Followups({ onNavigate }) {
  const toast = useToast();
  const { syncState, items, upcoming, dormant, week, failedSources, reload } = useFollowups();
  // 넛지는 더 이상 전용 섹션이 아니다(운영자 2026-09-24) — 행 하나당 제안 팁 하나로 붙는다.
  // 이미 다른 요소가 같은 사실을 말하는 규칙(놓친 약속 자체·기록할까요 섹션 등)은
  // TIP_RULE_IDS가 걸러 낸다.
  const crmNudges = useCrmNudges();
  const nudgesBySubjectId = React.useMemo(() => {
    const map = new Map();
    for (const nudge of crmNudges.nudges || []) {
      if (!TIP_RULE_IDS.has(nudge.ruleId)) continue;
      map.set(String(nudge.subject.id), nudge);
    }
    return map;
  }, [crmNudges.nudges]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = React.useRef(null);
  const [query, setQuery] = React.useState("");
  const [leaving, setLeaving] = React.useState(() => new Set()); // rowKey — 방금 기록해 빠지는 행
  const [recordTarget, setRecordTarget] = React.useState(null); // { target, preset, subtitle, aiContext, candidate, draft?, error?, suggestions?, initialQuery? }
  const [reschedule, setReschedule] = React.useState(null); // { key, busy, error }
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [candidatesKey, setCandidatesKey] = React.useState(0);
  const todayKey = kstDayKey(new Date());

  const markLeaving = React.useCallback((key, on) => {
    if (!key) return;
    setLeaving((prev) => {
      if (on === prev.has(key)) return prev;
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  // 약속을 어긴 건 → 오늘 하기로 한 건 → 나머지(접힘). 묶음 안 순서는 ledger가 정한 priority 그대로.
  const groups = React.useMemo(() => groupFollowups(items), [items]);
  const live = syncState === "live" || syncState === "partial";

  // 접힌 줄: 다가오는 약속 · 기약 없음 · 약속 비어 있음. 저장소의 약속 장부(upcoming·dormant)가
  // 정본이고, 정체로 올라온 나머지 행(groups.rest)은 같은 고객이면 한 번만 센다.
  const more = React.useMemo(() => {
    const seen = new Set();
    const take = (list) => list.filter((item) => {
      const key = rowKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const upcomingRows = take([
      ...upcoming,
      ...groups.rest.filter((i) => !i.dormant && i.promisedAt && kstDayKey(i.promisedAt) > todayKey),
    ]);
    const dormantRows = take([...dormant, ...groups.rest.filter((i) => i.dormant)]);
    const openRows = take(groups.rest.filter((i) => !i.dormant && !i.promisedAt));
    return { upcoming: upcomingRows, dormant: dormantRows, open: openRows };
  }, [upcoming, dormant, groups.rest, todayKey]);

  const missed = groups.missed;
  const today = groups.today;
  const missedLive = React.useMemo(() => missed.filter((i) => !leaving.has(rowKey(i))), [missed, leaving]);
  const todayLive = React.useMemo(() => today.filter((i) => !leaving.has(rowKey(i))), [today, leaving]);
  const peopleCount = new Set([...missedLive, ...todayLive].map(rowKey)).size;
  const dueCount = peopleCount;

  // 키보드(§8.1): j/k 행 이동, e 기록, n 새 기록, / 검색. 이동 순서 = 화면 순서, 접힌 줄은 펼쳤을 때만.
  const kbList = React.useMemo(() => [
    ...missedLive,
    ...todayLive,
    ...(moreOpen ? [...more.upcoming, ...more.dormant, ...more.open].filter((i) => !leaving.has(rowKey(i))) : []),
  ], [missedLive, todayLive, moreOpen, more, leaving]);
  const kbRows = React.useMemo(() => kbList.map((i) => ({ id: kbId(i) })), [kbList]);
  const kbSelection = useCrmSelection(kbRows);

  // ── 기록 시트 ──
  const suggestions = React.useMemo(() => [...missedLive, ...todayLive].slice(0, 6).map(targetOf), [missedLive, todayLive]);
  const openBlank = React.useCallback(() => {
    setRecordTarget({ target: null, preset: {}, suggestions });
  }, [suggestions]);

  const openRecordFor = (item, variant) => {
    const org = item.company && item.company !== item.name ? item.company : null;
    const preset = { kind: CHANNEL_PRESET[item.channel] || "call" };
    // 아직 날짜가 안 된 약속에 기록을 남기면 그 약속을 이어 쓴다 — 빈 칸으로 열면 저장이 약속을 지운다.
    if (variant === "upcoming" && item.promisedAt) {
      preset.followup = "dated";
      preset.at = kstDayKey(item.promisedAt);
      if (item.promiseText) preset.nextAction = item.promiseText;
    }
    const promise = item.promiseText ? ` — 약속: ${item.promiseText}` : "";
    setRecordTarget({
      target: targetOf(item),
      preset,
      subtitle: `${item.name}${org ? ` · ${org}` : ""}${promise}`,
      aiContext: `${org || item.name} · ${KIND_TAG[item.kind] || "고객"}${stageLabel(item) ? ` (${stageLabel(item)})` : ""}`,
    });
  };

  // 제안 팁의 [행동] 버튼 — 넛지가 가리키는 대상으로 같은 기록 시트를 연다(§8.1 표준 편집 동선).
  const openRecordForNudge = (nudge) => {
    setRecordTarget({
      target: { kind: nudge.subject.type, id: nudge.subject.id, companyId: nudge.subject.companyId || null, name: nudge.subject.name, org: null },
      preset: nudge.action?.prefill?.kind ? { kind: nudge.action.prefill.kind } : {},
      subtitle: `${nudge.subject.name} — ${nudge.title}`,
    });
  };

  const onTipEscape = async (nudge, action, until) => {
    const res = await crmNudges.suppress(nudge, action, until);
    if (!res.ok) toast.error(`제안을 처리하지 못했어요 — ${res.reason || "다시 시도해 주세요"}`);
  };

  const tipFor = (item) => {
    const nudge = nudgesBySubjectId.get(String(item.id));
    if (!nudge) return null;
    // dormant_recheck는 이 페이지의 '기약 없음' 행이 이미 같은 문구("N일 지남 — 다시
    // 볼까요?")를 직접 보여준다(위 promise/why 분기) — 여기서 또 붙이면 같은 말 반복.
    if (nudge.ruleId === "dormant_recheck") return null;
    const escapes = Array.isArray(nudge.escape) ? nudge.escape : [];
    return {
      reason: nudgeTipReason(nudge),
      action: nudge.action?.label,
      onAction: () => openRecordForNudge(nudge),
      onSnooze: escapes.includes("snooze") ? (until) => onTipEscape(nudge, "snooze", until) : undefined,
      onDismiss: escapes.includes("dismiss") ? () => onTipEscape(nudge, "dismiss") : undefined,
    };
  };

  const onCandidateRecord = (candidate) => {
    const customer = candidate?.customer || {};
    const [keyKind, keyId] = String(customer.key || "").split(":");
    const kind = ["lead", "deal", "account"].includes(customer.kind) ? customer.kind : ["lead", "account"].includes(keyKind) ? keyKind : null;
    const id = customer.id || (kind && keyId) || null;
    const target = kind && id ? { kind, id, companyId: null, name: customer.name || customer.org || "고객", org: customer.org || null } : null;
    const promiseAt = candidate?.promiseHint?.dueAt ? kstDayKey(candidate.promiseHint.dueAt) : "";
    const preset = {
      kind: CANDIDATE_CHANNEL[candidate?.channel] || "call",
      summary: String(candidate?.text || "").slice(0, 500),
      occurredAt: candidate?.occurredAt || null,
      durationSec: candidate?.durationSec ?? null,
      captureSource: candidate?.source === "phone" ? "phone" : candidate?.source === "calendar" ? "calendar" : "sheet",
      candidateId: candidate?.id || null,
      ...(candidate?.promiseHint?.title ? { nextAction: candidate.promiseHint.title } : {}),
      ...(promiseAt ? { followup: "dated", at: promiseAt } : {}),
    };
    setRecordTarget({
      target,
      preset,
      candidate,
      // 고객이 매칭되지 않은 후보는 이름으로 찾기부터 연다.
      initialQuery: target ? "" : customer.name || customer.org || "",
      suggestions,
      subtitle: target ? `${target.name}${target.org && target.org !== target.name ? ` · ${target.org}` : ""}` : null,
    });
  };

  const resolveCandidate = async (candidate) => {
    let res;
    try {
      res = await resolveRecordCandidate(candidate.id);
    } catch (error) {
      res = { ok: false, status: error instanceof Error ? error.message : String(error) };
    }
    if (!res?.ok) toast.error("기록은 저장됐지만 후보를 정리하지 못했어요 — 목록에 남아 있으면 '버림'을 눌러 주세요.");
    setCandidatesKey((k) => k + 1);
  };

  useCrmKeyboard({
    selection: kbSelection,
    onNew: openBlank,
    onSearchFocus: () => searchRef.current?.focus(),
    onEditSelected: (id) => {
      const item = kbList.find((i) => kbId(i) === id);
      if (!item) return;
      const variant = missedLive.includes(item) ? "missed" : todayLive.includes(item) ? "today" : more.upcoming.includes(item) ? "upcoming" : "other";
      openRecordFor(item, variant);
    },
  });
  React.useEffect(() => {
    if (!kbSelection.selectedId) return;
    document.querySelector(`[data-kb-row="${CSS.escape(kbSelection.selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [kbSelection.selectedId]);

  // 딥링크: ?focus=<id> — 목록이 읽힌 뒤 그 행을 한 번 고르고(접힌 줄이면 펼치고) 쿼리를 지운다
  // (DESIGN §8.1 "기록 로드 후 1회 열기 + 소거"). 내 작업 → 오늘 연락 → 고객 상세의 가운데 칸이다.
  const focusParam = searchParams?.get("focus") || null;
  const consumedFocusRef = React.useRef(null);
  React.useEffect(() => {
    if (!focusParam || syncState === "loading") return;
    if (consumedFocusRef.current === focusParam) return;
    const all = [...missed, ...today, ...more.upcoming, ...more.dormant, ...more.open];
    const hit = all.find((i) => String(i.id) === String(focusParam));
    if (!hit) return;
    consumedFocusRef.current = focusParam;
    if (!missed.includes(hit) && !today.includes(hit)) setMoreOpen(true);
    kbSelection.setSelectedId(kbId(hit));
    if (pathname) router.replace(pathname);
  }, [focusParam, syncState, missed, today, more, pathname, router, kbSelection]);

  // ── 날짜 다시 · 시점 정하기 ──
  const doReschedule = async (item, at) => {
    const key = rowKey(item);
    setReschedule({ key, busy: true, error: null });
    try {
      const r = await fetch("/api/hub/followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reschedule", kind: item.kind, id: item.id, at }),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.status === "saved") {
        setReschedule(null);
        markLeaving(key, true);
        toast.success(`약속을 ${shortDate(at, { weekday: true })}로 옮겼어요 · ${item.name}`);
        await reload();
        markLeaving(key, false);
        return;
      }
      // preview는 저장되지 않았다 — 성공 문구를 쓰지 않는다(Save envelope).
      const error = d?.status === "preview"
        ? "Preview · 연결 필요 — 저장되지 않았어요."
        : `날짜를 옮기지 못했어요 — ${d?.detail || d?.reason || d?.error || "다시 시도해 주세요"}`;
      setReschedule({ key, busy: false, error });
    } catch (error) {
      setReschedule({ key, busy: false, error: `날짜를 옮기지 못했어요 — ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const rowProps = {
    todayKey,
    onNavigate,
    reschedule,
    onReschedule: doReschedule,
    onRescheduleOpen: (item) => setReschedule({ key: rowKey(item), busy: false, error: null }),
    onRescheduleClose: () => setReschedule(null),
  };
  const renderRows = (list, variant, { rails = false } = {}) => list.map((item, index) => (
    <ContactRow
      key={rowKey(item)}
      item={item}
      variant={variant}
      // 빨강 예산(§5.3): 놓친 약속에도 레일은 상단 MAX_DANGER_RAILS개까지.
      rail={rails && index < MAX_DANGER_RAILS}
      leaving={leaving.has(rowKey(item))}
      selected={kbSelection.selectedId === kbId(item)}
      onRecord={(it) => openRecordFor(it, variant)}
      tip={tipFor(item)}
      {...rowProps}
    />
  ));

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    // 고객 탭이 ?q=로 검색을 채운다 — 다른 고객은 여기서 스크롤하지 않고 거기서 찾는다.
    if (q) onNavigate?.(`dashboard/revenue/customers?q=${encodeURIComponent(q)}`);
  };

  const partialReason = failedSources.map((s) => SOURCE_LABEL[s] || s).join("·");
  const moreCount = more.upcoming.length + more.dormant.length + more.open.length;
  const ctx = recordTarget;

  return (
    <div className="hub-futura hub-page fade-up today-contact">
      <header className="fx-head today-contact__head">
        <div className="today-contact__head-text">
          <div className="fx-eyebrow">{headerDate()} · 오늘 연락</div>
          <h2 className="fx-page-title today-contact__title">
            {live && peopleCount > 0 ? (
              <>오늘 챙길 사람 <span className="stat">{peopleCount}</span>명</>
            ) : live ? (
              "오늘 챙길 약속이 없어요"
            ) : (
              "오늘 연락"
            )}
          </h2>
          <p className="fx-page-sub today-contact__sub">
            {live && (
              <>
                <span className={missedLive.length > 0 ? "today-contact__missed num" : "num"}>놓친 약속 {missedLive.length}</span>
                <span aria-hidden="true">·</span>
                <span className="num">오늘 약속 {todayLive.length}</span>
              </>
            )}
            {syncState === "partial" && <TruthBadge state="partial" reason={partialReason ? `${partialReason} 읽기 실패` : undefined} />}
            {syncState === "preview" && <TruthBadge state="preview" />}
            {syncState === "error" && <TruthBadge state="error" />}
            {syncState === "loading" && <span>약속을 불러오는 중이에요</span>}
          </p>
        </div>
        <div className="today-contact__head-actions">
          <form role="search" onSubmit={submitSearch} className="today-contact__search-form">
            <Input
              ref={searchRef}
              icon="search"
              size="md"
              kbd="/"
              value={query}
              onChange={setQuery}
              clearable
              placeholder="고객 이름·학원 찾기"
              ariaLabel="고객 이름·학원 찾기 — Enter로 고객 탭에서 검색"
              className="today-contact__search"
            />
          </form>
          <Button variant="primary" size="md" icon="plus" onClick={openBlank} className="today-contact__cta">
            연락 기록 <Kbd>N</Kbd>
          </Button>
        </div>
      </header>

      <div className="today-contact__grid">
        <div className="today-contact__col">
          {syncState === "loading" && items.length === 0 ? (
            // §11: 레이아웃을 아는 로딩은 Skeleton — "연락 데이터 없음" 문구로 그리지 않는다.
            <section aria-label="약속 불러오는 중">
              <SectionHead title="놓친 약속 · 오늘 약속" count="…" />
              <div className="today-contact__list">
                <Skeleton lines={5} height={14} label="연락 목록 불러오는 중" style={{ padding: 18 }} />
              </div>
            </section>
          ) : syncState === "error" ? (
            // error를 preview 문구로 뭉개면 읽기 실패가 "오늘 할 일 없음"으로 보인다 — 후속 누락 0건
            // 목표에서 가장 위험한 오독이라 상태별로 분리한다(§5.3 source truth).
            <div className="today-contact__list">
              <EmptyState
                icon="clock"
                title="연락 목록을 읽지 못했습니다"
                description="지금 화면은 비어 보이지만 실제 약속이 있을 수 있습니다. 다시 시도해 주세요."
                action={<Button variant="outline" size="sm" onClick={reload}>다시 시도</Button>}
              />
            </div>
          ) : syncState === "preview" ? (
            <div className="today-contact__list">
              <EmptyState
                icon="rhythm"
                title="연락 데이터 없음"
                description="Supabase가 연결되면 놓친 약속과 오늘 약속이 여기 뜹니다."
              />
            </div>
          ) : missed.length > 0 ? (
            <section aria-label="놓친 약속">
              <SectionHead title="놓친 약속" count={missedLive.length} danger hint="약속한 날이 지났어요" />
              <div className="today-contact__list">{renderRows(missed, "missed", { rails: true })}</div>
            </section>
          ) : null}

          {/* 기록할까요 — 캘린더·통화에서 찾은 "연락했는데 기록이 없는 것". 섹션 전체(제목·건수·
              읽기 상태)는 그 컴포넌트가 소유하고, 비었으면 스스로 그리지 않는다. */}
          <RecordCandidates key={candidatesKey} onRecord={onCandidateRecord} onNavigate={onNavigate} />

          {live && (
            <section aria-label="오늘 약속">
              <SectionHead title="오늘 약속" count={todayLive.length} />
              <div className="today-contact__list">
                {today.length > 0 ? (
                  renderRows(today, "today")
                ) : (
                  <EmptyState
                    icon="rhythm"
                    title="오늘 연락하기로 한 고객이 없어요"
                    description={more.upcoming.length > 0
                      ? `다가오는 약속 ${more.upcoming.length}건은 아래 접힌 목록에 있어요. 다른 고객은 위 검색으로 찾으세요.`
                      : "기록을 남기면 다음 약속이 날짜에 맞춰 여기 모여요."}
                    action={<Button variant="outline" size="sm" icon="leads" onClick={() => onNavigate?.("dashboard/revenue/customers")}>고객 보기</Button>}
                    style={{ minHeight: 140 }}
                  />
                )}
              </div>
            </section>
          )}

          {live && moreCount > 0 && (
            <details className="today-contact__more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
              <summary>
                <span>
                  다가오는 약속 <b className="num">{more.upcoming.length}</b>
                  {" · "}기약 없음 <b className="num">{more.dormant.length}</b>
                  {more.open.length > 0 && <>{" · "}약속 비어 있음 <b className="num">{more.open.length}</b></>}
                </span>
                <span className="today-contact__chev" aria-hidden="true"><Iconed name="chevronR" size={14} /></span>
              </summary>
              {more.upcoming.length > 0 && (
                <div className="today-contact__more-group" role="group" aria-label="다가오는 약속">
                  <div className="fx-eyebrow today-contact__more-label">다가오는 약속</div>
                  {renderRows(more.upcoming, "upcoming")}
                </div>
              )}
              {more.dormant.length > 0 && (
                <div className="today-contact__more-group" role="group" aria-label="기약 없음">
                  <div className="fx-eyebrow today-contact__more-label">기약 없음 · 30일이 지나면 다시 묻습니다</div>
                  {renderRows(more.dormant, "dormant")}
                </div>
              )}
              {more.open.length > 0 && (
                <div className="today-contact__more-group" role="group" aria-label="약속 비어 있음">
                  <div className="fx-eyebrow today-contact__more-label">약속 비어 있음 · 연락이 뜸한 고객</div>
                  {renderRows(more.open, "open")}
                </div>
              )}
            </details>
          )}
        </div>

        <WeekRail syncState={syncState} week={week} missedCount={missedLive.length} dueCount={dueCount} />
      </div>

      {ctx && (
        <ContactRecordDrawer
          target={ctx.target}
          preset={ctx.preset}
          draft={ctx.draft || null}
          initialError={ctx.error || ""}
          subtitle={ctx.subtitle || null}
          aiContext={ctx.aiContext || null}
          searchTargets={searchContactTargets}
          suggestions={ctx.suggestions || []}
          initialQuery={ctx.initialQuery || ""}
          undoMode="toast"
          // 콜백은 연 순간의 ctx를 붙든다 — 시트는 저장과 동시에 닫혀 recordTarget이 비지만,
          // 되돌리기·저장 확인·늦은 실패는 그 뒤에 온다.
          onSaved={(_saved, t) => markLeaving(t ? rowKey(t) : null, true)}
          onUndone={(_id, t) => markLeaving(t ? rowKey(t) : null, false)}
          onSummaryPersisted={(_ids, t) => {
            if (ctx.candidate) resolveCandidate(ctx.candidate);
            reload().then(() => markLeaving(t ? rowKey(t) : null, false));
          }}
          onPersisted={(_ids, t) => toast.success(`기록됨 · ${t?.name || "고객"}`)}
          onFailed={({ message, form, target: t }) => {
            markLeaving(t ? rowKey(t) : null, false);
            toast.error(`기록하지 못했습니다 · ${t?.name || "고객"} — ${message}`);
            // 입력을 조용히 잃지 않는다 — 원인과 함께 같은 고객 기록창을 입력 그대로 다시 연다.
            setRecordTarget((cur) => cur || { ...ctx, target: t || ctx.target, draft: form, error: message });
          }}
          onClose={() => setRecordTarget(null)}
        />
      )}
    </div>
  );
}
