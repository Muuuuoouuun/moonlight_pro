// KST 날짜 경계 — 순수 함수, import 없음.
//
// 같은 규칙이 attention-ledger(dateKey/bucketFor)·daily-focus(kstDayKey/diffKstDays)에 각각
// 복제돼 있었다. 고객 연락 큐가 세 번째 사본을 만드는 대신 여기로 모은다. 서버는 UTC로 돌기
// 때문에 "오늘"·"지남" 판정은 반드시 KST day-key 비교여야 한다 — 24시간 나눗셈(floor)으로
// 세면 오후에 잡은 "내일 09:00"이 0일(=오늘)으로 접힌다.

const TIME_ZONE = "Asia/Seoul";
const DAY_MS = 86400000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// ISO/Date → 'YYYY-MM-DD'(KST). 날짜만 있는 문자열은 그대로 통과시킨다 — UTC 자정으로
// 파싱했다가 다시 KST로 포맷하면 하루가 밀릴 수 있다.
export function kstDayKey(value) {
  if (!value) return "";
  if (DATE_ONLY.test(String(value))) return String(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // en-CA는 YYYY-MM-DD를 준다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 달력 일수 차이(toKey - fromKey). 한쪽이라도 비면 0.
export function diffKstDays(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / DAY_MS);
}

// 기한 → 버킷. todayKey/weekEndKey는 호출측이 한 번 계산해 넘긴다.
export function dueBucket(whenAt, todayKey, weekEndKey) {
  const key = kstDayKey(whenAt);
  if (!key) return "later";
  if (key < todayKey) return "overdue";
  if (key === todayKey) return "today";
  if (weekEndKey && key <= weekEndKey) return "week";
  return "later";
}

// 오늘부터 N일 뒤의 day-key (주 경계 계산용).
export function kstDayKeyAfter(days, now = Date.now()) {
  const base = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  return kstDayKey(new Date(base + days * DAY_MS));
}
