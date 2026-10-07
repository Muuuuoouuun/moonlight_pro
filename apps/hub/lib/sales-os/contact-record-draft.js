// 연락 기록 초안 — 어디에 두고, 다시 열 때 무엇을 되살리는가. React·window를 직접 만지지 않는다.
//
// 초안은 서버에 없다. 탭 저장소(sessionStorage)에 두고, 막힌 창(사생활 보호 등)에서는 메모리
// 사본으로 버틴다. 두 곳은 살아남는 범위가 달라서(탭 저장소는 새로고침을 견디고 메모리 사본은
// 아니다) 읽기·쓰기는 초안이 실제로 놓인 곳을 함께 돌려준다 — 화면은 그 곳을 그대로 말한다
// (contact-record.js의 draftHintCopy · draftRestoredCopy). 저장소는 인자로 받아 시험에서 막힌
// 창·중간에 막히는 창을 그대로 세워 본다.

const PROBE_KEY = "crm-record:probe";

// getStorage: 탭 저장소를 돌려주는 함수(예: () => window.sessionStorage). 접근만으로 던지는
// 브라우저가 있어 부를 때마다 감싼다 — 던지거나 없으면 메모리 사본만 쓴다.
export function createRecordDraftStore(getStorage) {
  const memory = new Map();
  // 탭 저장소에 닿지 못한 키 — 메모리 사본이 최신이고, 삭제한 키는 옛 탭 값을 되살리지 않는다.
  const stranded = new Set();
  const storage = () => {
    try {
      return getStorage?.() || null;
    } catch {
      return null;
    }
  };

  return {
    // → { value, place: "tab" | "memory" } | null
    read(key) {
      if (!stranded.has(key)) {
        try {
          const raw = storage()?.getItem(key);
          if (raw) return { value: JSON.parse(raw), place: "tab" };
        } catch {
          /* 저장소가 막혀도 메모리 사본으로 계속한다 */
        }
      }
      return memory.has(key) ? { value: memory.get(key), place: "memory" } : null;
    },

    // → 초안이 놓인 곳. 탭 저장소가 거절하면(막힘·용량) 메모리 사본만 남았다고 말한다.
    write(key, value) {
      memory.set(key, value);
      try {
        const tab = storage();
        if (!tab) throw new Error("no tab storage");
        tab.setItem(key, JSON.stringify(value));
        stranded.delete(key);
        return "tab";
      } catch {
        stranded.add(key);
        return "memory";
      }
    },

    clear(key) {
      memory.delete(key);
      stranded.add(key);
      try {
        const tab = storage();
        if (!tab) return;
        tab.removeItem(key);
        stranded.delete(key);
      } catch {
        /* 삭제가 막혔으면 이 페이지에서는 탭에 남은 옛 값을 읽지 않는다 */
      }
    },

    // 아직 아무것도 쓰지 않은 창이 "닫으면 어디에 남는지"를 말하려면 써 보기 전에 알아야 한다.
    probe() {
      try {
        const tab = storage();
        if (!tab) return "memory";
        tab.setItem(PROBE_KEY, "1");
        tab.removeItem(PROBE_KEY);
        return "tab";
      } catch {
        return "memory";
      }
    },
  };
}

const blank = (value) => value == null || value === "";

// 기록창을 열 때 폼에 얹을 값을 정한다. → { values, restored, seeded }
//   failed — 저장 실패 뒤 다시 연 창. 호출처가 넘긴 입력(draft)이 그대로 이긴다.
//   그 밖의 draft는 호출처가 미리 채운 씨앗이다(예: "했어요 · 기록"의 약속 문구). 운영자가
//   쓰던 초안이 있으면 초안이 이기고 씨앗은 초안의 빈 칸만 채운다 — 미리 채운 값이 쓰던 글을
//   덮지 않는다("닫아도 초안으로 남아요"라는 약속).
//   restored — 쓰던 초안을 되살렸다(되살림 줄을 보인다).
//   seeded   — 씨앗만 얹었다. 운영자가 쓴 글이 아니므로 그대로면 초안으로 두지 않는다.
export function openRecordDraft({ stored = null, draft = null, failed = false } = {}) {
  if (draft && failed) return { values: draft, restored: false, seeded: false };
  if (stored) {
    const kept = Object.fromEntries(Object.entries(stored).filter(([, value]) => !blank(value)));
    return { values: { ...stored, ...(draft || {}), ...kept }, restored: true, seeded: false };
  }
  if (draft) return { values: draft, restored: false, seeded: true };
  return { values: null, restored: false, seeded: false };
}
