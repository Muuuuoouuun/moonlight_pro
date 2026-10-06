// 금액 표기 — 2026-10-06 운영자 확정: 만·억 단위("120만원", "1억 2,000만원").
// 이전에는 화면·API마다 "₩1.2M"/"₩900K"/"1,200,000원"을 따로 만들었다. 이 파일이 유일한 정본이다.
//
// - formatWon: 정확한 금액. 원 단위까지 잃지 않는다 — 편집 필드로 돌아가 다시 저장되는 값도 이걸 쓴다.
// - formatWonShort: 머리·KPI·차트·칩용 반올림 금액. 저장 값으로 되돌려 쓰지 않는다.
// - parseWon: 표시 문자열 → 숫자(정렬·입력). 새 표기와 옛 "₩1.2M"·"900K" 저장 문자열을 모두 읽는다.

const MAN = 10_000;
const EOK = 100_000_000;
const MINUS = "−"; // U+2212 — 표시용 음수 기호

function toAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const comma = (n) => n.toLocaleString("ko-KR");
const decimal = (n) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

// 120만원 · 1억 2,000만원 · 123만 4,567원 · 9,900원 · 0원
export function formatWon(value, { empty = "—" } = {}) {
  const n = toAmount(value);
  if (n === null) return empty;
  const abs = Math.abs(n);
  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const rest = abs % MAN;
  const parts = [];
  if (eok) parts.push(`${comma(eok)}억`);
  if (man) parts.push(`${comma(man)}만`);
  if (rest || parts.length === 0) parts.push(comma(rest));
  return `${n < 0 ? MINUS : ""}${parts.join(" ")}원`;
}

// 1,235만원 · 1.5만원 · 1.2억원 · 9,900원 — unit:false면 "원"을 뺀다(차트 축·좁은 칩).
export function formatWonShort(value, { empty = "—", unit = true } = {}) {
  const n = toAmount(value);
  if (n === null) return empty;
  const suffix = unit ? "원" : "";
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs < MAN) return `${sign}${comma(abs)}${suffix}`;
  if (abs < 10 * MAN) return `${sign}${decimal(Math.round((abs / MAN) * 10) / 10)}만${suffix}`;
  const man = Math.round(abs / MAN);
  if (man < MAN) return `${sign}${comma(man)}만${suffix}`;
  const eok = abs / EOK;
  const rounded = eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10;
  return `${sign}${decimal(rounded)}억${suffix}`;
}

// 정확한 차이 금액 — "+3만 4,000원" · "−20만원" · "0원". 결제 대조처럼 원 단위가 중요한 곳.
export function formatSignedWon(value) {
  const n = toAmount(value) ?? 0;
  if (n === 0) return formatWon(0);
  return `${n > 0 ? "+" : MINUS}${formatWon(Math.abs(n))}`;
}

// 차이 금액 — "+30만원" · "−20만원" · "0원". 예상 대비 확정의 차이를 말할 때만 쓴다.
export function formatSignedWonShort(value, options) {
  const n = toAmount(value) ?? 0;
  if (n === 0) return formatWonShort(0, options);
  return `${n > 0 ? "+" : MINUS}${formatWonShort(Math.abs(n), options)}`;
}

// "천" 단위까지 허용하는 만 미만 덩어리 — "2천" · "2천5백" 대신 "2천500"까지.
function parseChunk(text) {
  if (!text) return 0;
  const thousand = /^(\d+(?:\.\d+)?)천(\d*)$/.exec(text);
  if (thousand) return Number(thousand[1]) * 1000 + (thousand[2] ? Number(thousand[2]) : 0);
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

// "120만원" · "1억 2,000만" · "1.2억" · "2천만원" · "9,900원" · "₩1.2M" · "900K" · 1200000 → 숫자.
// 읽을 수 없으면 null — 호출처가 0이나 정렬 꼬리로 정한다.
export function parseWon(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  let text = String(value ?? "").trim();
  if (!text || text === "—") return null;
  let sign = 1;
  if (/^[-−]/.test(text)) { sign = -1; text = text.slice(1); }
  else if (text.startsWith("+")) text = text.slice(1);
  text = text.replace(/[₩,\s]/g, "").replace(/원$/, "");
  if (!/\d/.test(text)) return null;

  const legacy = /^(\d*\.?\d+)([mMkK])$/.exec(text);
  if (legacy) {
    const scale = legacy[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    return sign * Math.round(Number(legacy[1]) * scale);
  }

  const korean = /^(?:([\d.]+)억)?(?:([\d.]*천?[\d]*)만)?([\d.]*천?[\d]*)$/.exec(text);
  if (!korean || !/[억만천]/.test(text)) {
    return /^\d*\.?\d+$/.test(text) ? sign * Math.round(Number(text)) : null;
  }
  const eok = korean[1] ? Number(korean[1]) : 0;
  const man = parseChunk(korean[2]);
  const rest = parseChunk(korean[3]);
  if (![eok, man, rest].every(Number.isFinite)) return null;
  return sign * Math.round(eok * EOK + man * MAN + rest);
}
