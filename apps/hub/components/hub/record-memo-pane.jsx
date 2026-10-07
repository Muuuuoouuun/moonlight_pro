"use client";

// 넓은 기록창의 메모 모드 — 같은 칸에서 쓰는 메모(2026-09-30 넓은 기록창 ⑥ · Q-CR6, 권장 · 화면 확인 뒤
// 확정). ContactRecordForm의 memo 자리에 놓인다: 큰 글쓰기 칸 하나 + 저장 줄. 어떻게 · 반응 · 다음 약속이
// 없다 — 메모는 연락이 아니라서 마지막 연락일과 약속을 바꾸지 않는다.
//
// 새 메모 저장소를 만들지 않는다. 저장은 일지 메모 작성기(useMemoDocument → POST /api/hub/journal,
// journal_workflow_v1) 그대로이고 이 고객이 문맥으로 붙는다(lead:<id> · account:<id>). 그 작성기가
// 멱등 요청 · 저장 확인 · 같은 탭 초안을 든다 — 이 파일은 그 상태를 기록창의 말로 그릴 뿐이다
// (무엇을 보일지는 lib/sales-os/record-memo.js, 순수). 초안 자리는 드로어의 메모 창(ContextMemoDrawer)과
// 같은 키(contextMemoStorageKey)라, 어느 쪽에서 쓰다 닫아도 같은 글로 이어진다 — 연락 기록 초안
// (crm-record:<종류>:<id>)과는 다른 키다.
//
// 저장이 확인되면(서버가 saved | duplicate로 답한 뒤에만) 칸이 비고 창은 그대로다 — 다음 메모를 이어 쓴다.
// 다음 메모는 새 ID의 새 작성기다. 그 작성기가 서는 동안 글쓰기 칸을 걷지 않는다(handoff): 다음 메모의 빈
// 초안을 서버가 방금 확인해 준 문맥으로 미리 세워 두어(nextMemoSeed) 작성기가 문맥을 다시 확인하러 가지 않고,
// 그 한 박자 동안에도 칸은 서 있고 커서가 거기 있다 — 이어 친 글자가 문서로 떨어져 전역 단축키(C · ?)로 새지 않게.
// 제목 · 태그 · 기록 시각 · 다른 문맥 연결은 여기 없다: 저장된 메모를 기록 줄에서 열면 메모 창이 그 일을 한다.

import React from "react";
import { Button, Kbd, Skeleton, TextAreaField, TruthBadge } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { RecordAwayBar, RecordPrimarySlot, RecordSaveLine, useGrowingDetail } from "./contact-record-form";
import { RecordReceipt } from "./record-context-column";
import { fetchJournal, useMemoDocument } from "./pages/use-memos";
import { claimContextMemoId, contextMemoKey, contextMemoStorageKey, releaseContextMemoId } from "@/lib/project-customer-context";
import { createJournalStore, journalTabId, rememberJournalWorkspace } from "@/lib/journal-browser-store";
import { MEMO_CHANGED_EVENT } from "@/lib/journal-search-client";
import { isCanonicalUuid } from "@/lib/uuid";
import { recordAwayLabel } from "@/lib/sales-os/contact-record";
import { memoRestoredCopy, nextMemoSeed, recordMemoLine } from "@/lib/sales-os/record-memo";
import "./record-window.css";

// 서버 렌더(테스트 포함)에는 레이아웃 효과가 없으므로 그때만 일반 효과로 내려간다(contact-record-form.jsx와 같은 규칙).
const useLayoutEffectOnClient = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// 그리기 — model은 useMemoDocument의 결과(준비 전에는 null). 이 컴포넌트는 저장소를 모른다.
// boot: "loading" | "error" | "ready" — 메모 저장소(워크스페이스) 확인 상태.
// savedAt: 방금 저장이 확인된 시각(빈 칸일 때 영수증으로 선다). contactLine: 앞서 누른 연락 기록의 진행 줄.
// handoff: 저장 확인 직후 다음 메모의 작성기가 서는 중 — 준비 전에도 칸(빈 칸 · 아직 받지 않음)과 영수증이 선다.
// saveRef.current에 저장 함수를 둔다 — 기록창의 ⌘↵가 부른다.
// 휴대폰 시트 · 좁은 화면(2026-09-30 넓은 기록창 ③)에서 폼이 더 넘기는 것 — 전부 선택이고, 없으면 지금 그대로다:
//   sheet    — 휴대폰 시트인가. 글쓰기 칸이 여섯 줄에서 시작한다(키보드 위에 남는 높이).
//   head     — 흐르는 칸 맨 위에 놓을 것(시트의 '연락 기록 | 메모' 전환 칸).
//   saveSlot — 주 버튼이 설 머리 자리(RecordPrimarySlot). 주 버튼은 여전히 하나다.
//   away     — '이 고객' 탭을 보는 중. 메모 칸은 가려진 채 서 있고, 아래 줄이 '쓰던 메모 · N자'와 돌아갈 길을 보인다.
//   contactProgress · onContactUndo — 앞서 누른 연락 기록의 진행(기록 중 · 되돌리기 → 저장 중). 띠의 contactLine과
//              같은 것이다: 가려진 동안에는 아래 줄이 대신 보인다 — 탭을 옮겼다고 3.5초 되돌리기가 사라지지 않는다.
//   onReturn · onAttention — 쓰기로 돌아가기 / 저장이 막혔거나 실패해 메모 칸을 봐야 할 때.
export function RecordMemoView({ boot = "ready", bootMessage = "", onBootRetry, model = null, savedAt = null, handoff = false, contactLine = null, saveRef = null, onSettled, sheet = false, head = null, saveSlot, away = false, onReturn, onAttention, contactProgress = null, onContactUndo }) {
  const [attempted, setAttempted] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const bodyRef = React.useRef(null);
  const draft = model?.draft || null;
  const ready = boot === "ready" && Boolean(model?.ready && draft);
  // 칸이 서 있는가 — 준비됐거나, 저장 확인 직후 다음 작성기를 넘겨받는 중이다.
  const standing = ready || (boot === "ready" && Boolean(handoff && savedAt && model));
  const body = draft?.body || "";
  const empty = !body.trim();
  // 처음 준비된 순간 본문이 있으면 같은 탭에서 쓰다 만 메모다 — 어디 것을 불러왔는지 말한다.
  const restoredRef = React.useRef(null);
  if (ready && restoredRef.current == null) restoredRef.current = !empty;

  const plan = recordMemoLine({
    boot, bootMessage, ready,
    source: model?.source, busy: Boolean(model?.busy), pending: Boolean(model?.pending), conflict: Boolean(model?.conflict),
    saveState: model?.saveState, message: model?.message || "", localError: Boolean(model?.localError),
    // 작성기가 저장본을 들고 있고 고친 게 없다 — 다음 메모로 넘어가기 직전의 한 장면이다.
    stored: Boolean(model?.entry) && !model?.dirty,
    empty, attempted, savedAt, handoff: standing && !ready,
  });

  // 가려진 동안('이 고객' 탭)은 재지 않고, 돌아온 순간과 배치가 바뀔 때 다시 잰다(연락 기록의 자세히와 같은 규칙).
  useGrowingDetail(bodyRef, ready && !away, body, sheet);

  // 메모 칸이 서면 커서를 둔다 — 모드를 바꿨거나(전환 칸을 누른 직후) 저장 뒤 빈 칸이 다시 섰을 때.
  // 저장 뒤에는 작성기가 준비되기를 기다리지 않고(standing), 그리기 전에 둔다(레이아웃 효과): 앞 메모의 칸이
  // 사라진 뒤 커서가 문서에 떨어져 있는 틈을 두지 않는다. 읽기 칸 등 기록 칸 밖을 보고 있었다면 건드리지 않는다.
  useLayoutEffectOnClient(() => {
    const el = bodyRef.current;
    if (!standing || !el) return;
    const active = document.activeElement;
    if (!active || active === document.body || el.closest(".record-wide")?.contains(active)) el.focus();
  }, [standing]);

  const edit = (value) => {
    if (!ready) return; // 넘겨받는 중의 칸은 아직 받지 않는다 — 작성기 없는 글을 만들지 않는다
    if (attempted) setAttempted(false);
    model.edit({ body: value });
  };

  const save = () => {
    const { action } = plan.primary;
    if (action === "reload") { onBootRetry?.(); return; }
    if (!action || !ready) return;
    if (action === "confirm") { model.retry(); return; }
    if (action === "overwrite") { model.chooseConflict(true); model.save(); return; }
    setAttempted(true);
    // '이 고객' 탭에서 누른 저장이 막혔으면(빈 메모 · 연결 전) 쓰기로 돌아와 저장 줄의 이유를 보인다.
    if (empty || model.source !== "live") onAttention?.();
    // 가려져 있던 칸은 쓰기 탭이 다시 선 다음 프레임에야 커서를 받는다(연락 기록의 빠진 칸과 같은 규칙).
    if (empty) {
      if (away) requestAnimationFrame(() => bodyRef.current?.focus());
      else bodyRef.current?.focus();
      return;
    }
    if (model.source !== "live") return;
    // 기록 시각은 저장을 누른 지금이다 — 빈 칸이 열려 있던 시각이 아니라. 이미 저장된 메모를 고쳐 쓰는
    // 길(충돌 뒤 내 글로 저장)은 그 메모의 시각을 그대로 둔다.
    if (!model.entry) model.edit({ occurredAt: new Date().toISOString() });
    model.save();
  };
  if (saveRef) saveRef.current = save;

  // 충돌에서 저장본을 그대로 두기 — 내 글을 버리고 다음 메모로 넘어간다(저장본은 기록 줄에 이미 있다).
  // 저장 확인이 아니다(entry 없이 끝낸다) — 다음 메모의 문맥은 그 저장본이 든 것(서버가 확인한 것)을 넘긴다.
  const keepStored = () => { const stored = model.conflict; model.chooseConflict(false); onSettled?.(null, stored?.contexts); };

  // 실패 · 미확인 · 충돌은 저장 줄의 레일 줄이 말한다 — 가려진 탭에서 생기면 쓰기로 돌린다.
  const issue = plan.line.note?.tone === "error" ? plan.line.note.title || "" : "";
  React.useEffect(() => {
    if (issue) onAttention?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 원인이 새로 섰을 때만 알린다(호출처는 매 렌더 새 함수를 넘긴다)
  }, [issue]);

  const returnToWriting = () => {
    onReturn?.();
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const booting = plan.phase === "booting";
  return (
    <>
      <div className="record-wide__scroll">
        {head}
        {booting ? (
          <Skeleton lines={4} height={16} width={["18%", "100%", "100%", "62%"]} gap={10} label="메모 칸 준비 중" />
        ) : plan.phase === "boot-error" ? (
          // 원인은 아래 저장 줄이 한 번 말한다(레일 + 제목, '다시 불러오기' 옆) — 여기는 빨강 없이 덧붙일 뿐이다.
          <div className="record-wide__notice"><span>없는 게 아니라 확인하지 못한 거예요 · 연락 기록은 그대로 남길 수 있어요.</span></div>
        ) : (
          <>
            {ready && restoredRef.current && !dismissed && !empty && !model.locked && (
              <div role="status" className="record-wide__notice">
                <Iconed name="edit" size={12} />
                <span style={{ flex: 1 }}>{memoRestoredCopy({ localError: model.localError })}</span>
                <Button variant="ghost" size="xs" onClick={() => { setDismissed(true); edit(""); bodyRef.current?.focus(); }}>지우기</Button>
              </div>
            )}
            {model.source !== "live" && (
              <div role="status" className="record-wide__notice">
                <TruthBadge state="preview" />
                <span>메모 저장소가 연결되지 않았어요.</span>
              </div>
            )}
            <TextAreaField
              ref={bodyRef}
              label="메모"
              value={body}
              rows={sheet ? 6 : 10}
              readOnly={!ready || model.locked}
              onChange={(e) => edit(e.target.value)}
              placeholder={"연락은 아니지만 이 고객에 대해 기억해 둘 것.\n성향, 결정하는 사람, 다음에 조심할 점 — 쓰는 만큼 칸이 길어져요."}
              maxLength={20000}
              showCount
              className="record-wide__detail"
              hint="Moonlight에만 남아요 · 이 고객의 기록 줄에 ‘메모 · 연락 아님’으로 보여요"
            />
          </>
        )}
      </div>

      <div className="record-wide__band" role="group" aria-label="메모 저장">
        {contactLine}
        <div className="record-wide__save">
          {plan.receipt
            ? <div className="record-wide__saved"><RecordReceipt receipt={plan.receipt} /></div>
            : <RecordSaveLine line={plan.line} />}
          {plan.phase === "conflict" && <Button variant="ghost" size="xs" onClick={keepStored}>저장본 그대로 두기</Button>}
          <RecordPrimarySlot slot={saveSlot}>
            <Button variant="primary" size="md" disabled={plan.primary.disabled} onClick={save}>
              {plan.primary.label}
              {saveSlot === undefined && !plan.primary.disabled && plan.primary.action !== "reload" && <Kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor", boxShadow: "none", opacity: 0.7 }}>⌘↵</Kbd>}
            </Button>
          </RecordPrimarySlot>
        </div>
      </div>
      {away && <RecordAwayBar label={recordAwayLabel({ mode: "memo", chars: body.trim().length })} progress={contactProgress} onUndo={onContactUndo} onReturn={returnToWriting} />}
    </>
  );
}

// 다음 메모의 빈 초안을 작성기의 탭 사본으로 미리 세운다 → 세웠으면 true. 탭 저장소가 막힌 창에서는 저장소가
// 메모리 사본을 남기므로(journal-browser-store) 그것도 세운 것이다. 세우지 못하면 작성기가 지금처럼 문맥을 확인한다.
function seedNextMemo(workspaceId, seed) {
  if (!seed) return false;
  try {
    const store = createJournalStore({ storage: sessionStorage, workspaceId, tabId: journalTabId() });
    try { store.write(seed.draft.id, seed); } catch { /* 메모리 사본이 남는다 — 작성기가 그 사실을 말한다 */ }
    return Boolean(store.read(seed.draft.id));
  } catch { return false; }
}

// 메모 한 건 — 일지 메모 작성기를 이 메모 ID에 묶는다. 저장이 확인되면(onSaved) 부모가 새 ID로 다시 세운다.
function RecordMemoDocument({ id, ledger, contexts, onSaved, ...view }) {
  const model = useMemoDocument({
    id, isNew: true, entry: null, contexts,
    workspaceId: ledger.workspaceId, workspaceConfirmed: isCanonicalUuid(ledger.workspaceId), source: ledger.status,
    onSaved,
  });
  return <RecordMemoView boot="ready" model={model} {...view} />;
}

// 이 페이지에서 마지막으로 확인한 메모 저장소({ workspaceId, status }). 연락 기록 ↔ 메모를 오갈 때마다 메모 칸을
// 확인 중(Skeleton)으로 되돌리지 않으려고 기억한다 — 다시 설 때 이 값으로 곧바로 서고, 확인은 뒤에서 다시 해서
// 달라졌으면 그 값으로 바꾼다. 기억한 값이 틀렸어도 "저장됨"은 서버가 답해야 선다(작성기의 계약) — 닿지 않으면
// 저장할 때 그렇게 말하고 글은 남는다.
let knownLedger = null;

// 메모 칸의 자리 — 확인된 저장소와 고객(identity)에서. 같은 탭 · 같은 고객이면 같은 메모 ID를 다시 받는다.
function memoSession(ledger, identity) {
  const storageKey = contextMemoStorageKey(ledger.workspaceId, identity);
  return { status: "ready", identity, ledger, storageKey, id: claimContextMemoId(sessionStorage, storageKey) };
}
const sameSession = (session, ledger, identity) => session.status === "ready" && session.identity === identity
  && session.ledger.workspaceId === ledger.workspaceId && session.ledger.status === ledger.status;

// contexts: [{ type: "lead" | "account", id, label }] — 이 메모가 붙을 고객(호출처가 uuid임을 확인해 준다).
// onSaved(entry): 서버가 저장을 확인한 메모 — 호출처가 기록 줄기에 영수증과 함께 세운다.
// saveRef · contactLine: ContactRecordForm의 memo 자리가 넘긴다.
// 그 밖에 폼이 넘긴 자리(sheet · head · saveSlot · away · onReturn · onAttention · contactProgress · onContactUndo)는
// 그리는 쪽(RecordMemoView)에 그대로 건넨다.
export function RecordMemoPane({ contexts = [], saveRef = null, contactLine = null, onSaved, ...slot }) {
  const identity = contextMemoKey(contexts);
  // 작성기는 contexts의 동일성으로 다시 읽을지 정한다 — 호출처가 매 렌더 새 배열을 넘겨도 같은 고객이면 같은 값.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 고객이 같으면(identity) 같은 문맥이다
  const stableContexts = React.useMemo(() => contexts, [identity]);
  // 처음 설 때: 이 페이지에서 저장소를 확인한 적이 있으면 곧바로 선다(서버 렌더 · 첫 확인 전에는 확인 중).
  const [session, setSession] = React.useState(() => {
    try { return knownLedger ? memoSession(knownLedger, identity) : { status: "loading" }; } catch { return { status: "loading" }; }
  });
  const [reload, setReload] = React.useState(0);
  const [savedAt, setSavedAt] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    // 이미 이 고객의 자리로 서 있으면 가리지 않는다 — 확인은 뒤에서 다시 한다.
    setSession((prev) => (prev.status === "ready" && prev.identity === identity ? prev : { status: "loading" }));
    fetchJournal("").then((answer) => {
      if (!active) return;
      if (answer.workspaceId) rememberJournalWorkspace(answer.workspaceId);
      const ledger = { workspaceId: answer.workspaceId || null, status: answer.status };
      knownLedger = ledger;
      const next = memoSession(ledger, identity);
      setSession((prev) => (sameSession(prev, ledger, identity) ? prev : next));
    }).catch((failure) => {
      // 기억한 저장소로 선 자리는 그대로 둔다(쓰던 글을 가리지 않는다) — 닿지 않으면 저장할 때 작성기가 말한다.
      if (active) setSession((prev) => (prev.status === "ready" && prev.identity === identity ? prev : { status: "error", message: failure?.message || "" }));
    });
    return () => { active = false; };
  }, [identity, reload]);

  // 한 건이 끝났다 — 같은 고객의 다음 메모는 새 ID에서 시작한다. entry가 있으면 방금 저장이 확인된 것이다.
  // contexts는 서버가 확인해 준 문맥(저장된 메모의 것)이다 — 다음 메모의 빈 초안을 그것으로 미리 세운다(seeded).
  const settle = (entry, contexts = entry?.contexts) => {
    if (session.status === "ready") {
      releaseContextMemoId(sessionStorage, session.storageKey);
      const id = claimContextMemoId(sessionStorage, session.storageKey);
      const seeded = seedNextMemo(session.ledger.workspaceId, nextMemoSeed({ id, contexts, seeds: stableContexts }));
      setSession({ ...session, id, seeded });
    }
    if (!entry) { setSavedAt(null); return; }
    window.dispatchEvent(new Event(MEMO_CHANGED_EVENT));
    setSavedAt(new Date().toISOString());
    onSaved?.(entry);
  };

  if (session.status !== "ready") {
    return (
      <RecordMemoView
        boot={session.status === "error" ? "error" : "loading"}
        bootMessage={session.message}
        onBootRetry={() => setReload((n) => n + 1)}
        contactLine={contactLine}
        saveRef={saveRef}
        {...slot}
      />
    );
  }
  return (
    <RecordMemoDocument
      key={`${session.ledger.workspaceId}:${session.id}`}
      id={session.id}
      ledger={session.ledger}
      contexts={stableContexts}
      onSaved={settle}
      onSettled={settle}
      savedAt={savedAt}
      handoff={Boolean(session.seeded)}
      contactLine={contactLine}
      saveRef={saveRef}
      {...slot}
    />
  );
}
