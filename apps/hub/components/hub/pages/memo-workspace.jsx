"use client";
import React from "react";
import { Button } from "../hub-primitives";
import {
  linksForMemo,
  memoKey,
  selectMemos,
  memoLinkVerified,
} from "@/lib/memo-view";
import styles from "./memo-workspace.module.css";
import { MemoCapture } from "./memo-capture";
const EMPTY = {
  memos: [],
  links: [],
  tasks: [],
  projects: [],
  linksComplete: false,
  status: "loading",
  failedSources: [],
  partialSources: [],
};
const SOURCE_LABELS = {
  notes: "메모",
  work_orders: "받은함",
  task_memo_links: "업무 연결 정보",
  tasks: "업무",
  projects: "프로젝트",
};
const STATUS = {
  inbox: "수집",
  todo: "계획",
  doing: "진행",
  blocked: "대기",
  done: "완료",
};
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
      })
    : "미정";

export function MemoWorkspace({
  taskId = null,
  initialSource = "",
  onOpenTask,
  onSaved,
  projects: projectOptions,
  initialProjectId = "",
  fetchImpl = fetch,
}) {
  const [data, setData] = React.useState(EMPTY);
  const [selected, setSelected] = React.useState(initialSource);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [projectFilter, setProjectFilter] = React.useState(initialProjectId);
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const requestRef = React.useRef(0);
  const [draft, setDraft] = React.useState({
    title: "",
    projectId: "",
    dueAt: "",
    taskId: "",
  });
  const load = React.useCallback(
    async (noteId = null) => {
      const request = ++requestRef.current;
      const params = new URLSearchParams();
      const requestedNote =
        typeof noteId === "string"
          ? noteId
          : initialSource.startsWith("note:")
            ? initialSource.slice(5)
            : null;
      if (taskId) params.set("task", taskId);
      else if (requestedNote) params.set("note", requestedNote);
      try {
        const response = await fetchImpl(
          `/api/hub/memos${params.size ? `?${params}` : ""}`,
          { cache: "no-store", signal: AbortSignal.timeout(10000) },
        );
        const next = await response.json();
        if (!response.ok || !Array.isArray(next.memos))
          throw new Error("read-failed");
        if (request === requestRef.current) setData(next);
        return next;
      } catch {
        if (request === requestRef.current)
          setData((current) => ({
            ...current,
            status: "error",
            linksComplete: false,
          }));
        return null;
      }
    },
    [taskId, initialSource, fetchImpl],
  );
  React.useEffect(() => {
    setSelected(initialSource);
  }, [initialSource]);
  React.useEffect(() => {
    setData(EMPTY);
    load();
    return () => {
      requestRef.current++;
    };
  }, [load]);
  const visible = selectMemos(data, {
    query,
    filter,
    projectId: projectFilter,
  });
  const memo =
    data.memos.find((item) => memoKey(item) === selected) ||
    (!selected ? visible[0] : null);
  const selectedKey = memo ? memoKey(memo) : "";
  React.useEffect(() => {
    setDraft({
      title: memo?.title?.replace(/^\[[^\]]+\]\s*/, "") || "",
      projectId: memo?.projectId || "",
      dueAt: "",
      taskId: "",
    });
    setFeedback("");
  }, [selectedKey]);
  const links = memo ? linksForMemo(memo, data.links) : [];
  const projects = projectOptions || data.projects;
  const allowedProjectIds = new Set(projects.map((project) => project.id));
  const candidateTasks = data.tasks.filter(
    (task) =>
      !links.some((link) => link.task_id === task.id) &&
      (!task.project_id || allowedProjectIds.has(task.project_id)),
  );
  const canWrite =
    data.status === "live" ||
    (data.status === "partial" &&
      !data.failedSources?.includes("task_memo_links"));
  const save = async (action) => {
    if (!memo || busyRef.current) return;
    if (action === "create" && (!draft.title.trim() || !draft.projectId)) {
      setFeedback("할 일 제목과 프로젝트를 지정하세요.");
      return;
    }
    if (action === "link" && !draft.taskId) {
      setFeedback("연결할 기존 업무를 선택하세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFeedback("연결을 저장하고 있습니다.");
    try {
      const response = await fetchImpl("/api/hub/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          sourceKind: memo.kind,
          sourceId: memo.id,
          ...draft,
          dueAt: draft.dueAt ? `${draft.dueAt}T23:59:00+09:00` : null,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const result = await response.json();
      if (!response.ok || !["saved", "duplicate"].includes(result.status))
        throw new Error(
          result.status === "preview"
            ? "저장 서버가 연결되지 않았습니다."
            : "연결을 저장하지 못했습니다. 입력을 유지했으니 다시 시도하세요.",
        );
      const fresh = await load();
      if (!fresh || !memoLinkVerified(fresh, memo, result.taskId))
        throw new Error(
          "저장 응답은 받았지만 연결 재확인이 필요합니다. 다시 시도해도 같은 원문에서 업무가 중복 생성되지 않습니다.",
        );
      setFeedback(
        result.status === "duplicate"
          ? "이미 연결된 업무를 확인했습니다."
          : "원문을 보존하고 업무에 연결했습니다.",
      );
      setDraft((current) => ({ ...current, taskId: "" }));
      onSaved?.();
    } catch (error) {
      setFeedback(
        error.name === "TimeoutError"
          ? "응답이 지연됐습니다. 다시 시도해 저장 결과를 확인하세요."
          : error.message,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const openTask = (task) =>
    onOpenTask
      ? onOpenTask(task.id, task)
      : window.location.assign(
          `/dashboard/work/projects?view=board&task=${encodeURIComponent(task.id)}`,
        );
  return (
    <section
      className={`${styles.workspace} ${taskId ? styles.compact : ""}`}
      aria-label={taskId ? "업무에 연결된 메모" : "메모 연결 작업대"}
    >
      <header className={styles.header}>
        <div>
          <h2>{taskId ? "원본 메모" : "메모 · 받은함"}</h2>
          <p>
            {taskId
              ? "이 업무의 근거가 된 기록"
              : "기록을 읽고 다음 행동으로 연결하세요."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
          새로고침
        </Button>
      </header>
      {!taskId && (
        <MemoCapture
          onSaved={async ({ id }) => {
            await load(id);
            setSelected(`note:${id}`);
            setProjectFilter("");
            setQuery("");
            setFilter("all");
            onSaved?.();
          }}
        />
      )}
      {data.status !== "live" && (
        <p role="status" className={styles.notice}>
          {data.status === "loading"
            ? "기록을 불러오는 중입니다."
            : data.status === "preview"
              ? "미리보기 · 데이터 저장소가 연결되면 실제 메모가 표시됩니다."
              : data.status === "error"
                ? "기록을 읽지 못했습니다. 새로고침해 다시 확인하세요."
                : `일부 기록만 확인했습니다 · ${[...(data.failedSources || []), ...(data.partialSources || [])].map((source) => SOURCE_LABELS[source] || "기록").join(", ")}. 검색은 불러온 기록에 한정됩니다.`}
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.list}>
          <label className={styles.search}>
            <span className={styles.srOnly}>메모 제목·본문·라벨 검색</span>
            <input
              type="search"
              placeholder="메모 제목·본문·라벨 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {!taskId && (
            <>
              <select
                aria-label="메모 프로젝트 필터"
                value={projectFilter}
                disabled={busy}
                onChange={(event) => setProjectFilter(event.target.value)}
              >
                <option value="">전체 프로젝트 · 받은함 포함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className={styles.filters}>
                {[
                  ["all", "전체"],
                  ["linked", "업무에 연결됨"],
                  ["unlinked", "연결 없음"],
                  ["older", "저장 후 30일 이상"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    disabled={key === "unlinked" && !data.linksComplete}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {visible.map((item) => (
            <button
              type="button"
              className={styles.row}
              key={memoKey(item)}
              aria-pressed={memoKey(item) === selectedKey}
              disabled={busy}
              onClick={() => setSelected(memoKey(item))}
            >
              <strong>{item.title}</strong>
              <span>
                {item.kind === "note" ? "메모" : "빠른 입력"} ·{" "}
                {dateLabel(item.createdAt)}
              </span>
              <small>
                {linksForMemo(item, data.links).length
                  ? "업무에 연결됨"
                  : data.linksComplete
                    ? "연결 없음"
                    : "연결 여부 미확인"}
              </small>
            </button>
          ))}
          {!visible.length && data.status !== "loading" && (
            <p className={styles.notice}>
              {data.failedSources?.some((source) =>
                ["notes", "work_orders"].includes(source),
              )
                ? "메모 원문을 읽지 못했습니다. 새로고침해 다시 확인하세요."
                : data.failedSources?.includes("task_memo_links")
                  ? "업무 연결 정보를 불러오지 못했습니다. 연결 기능을 사용할 수 없습니다."
                  : taskId
                    ? "확인된 연결 메모가 없습니다."
                    : "표시할 메모가 없습니다. 위의 ‘새 메모 · 파일 가져오기’에서 기록을 남겨보세요."}
            </p>
          )}
          <p className={styles.notice}>
            현재 표시 {visible.length}건 · 불러온 기록 안에서 검색
          </p>
        </div>
        {memo && (
          <article className={styles.detail}>
            <h3>{memo.title}</h3>
            <p className={styles.meta}>
              {memo.kind === "note" ? "메모" : "빠른 입력 원문"} ·{" "}
              {dateLabel(memo.createdAt)}
            </p>
            <div className={styles.body}>{memo.body || "본문 없음"}</div>
            <p className={styles.meta}>
              {memo.scope === "personal"
                ? "개인"
                : memo.scope === "company"
                  ? "회사 업무"
                  : "범위 미지정"}{" "}
              · {memo.source?.name || "직접 기록"}
              {memo.labels?.length ? ` · ${memo.labels.join(" · ")}` : ""}
            </p>
            {memo.originalBody != null && memo.originalBody !== memo.body && (
              <details>
                <summary>가져온 파일 원문 보기</summary>
                <div className={styles.body}>{memo.originalBody}</div>
              </details>
            )}
            <section className={styles.section}>
              <h4>이 메모를 사용하는 업무</h4>
              {links.map((link) => {
                const task = data.tasks.find((t) => t.id === link.task_id);
                return task ? (
                  <button
                    type="button"
                    className={styles.task}
                    key={link.id}
                    onClick={() => openTask(task)}
                  >
                    <span>{task.title}</span>
                    <small>
                      {STATUS[task.status] || task.status} ·{" "}
                      {dateLabel(task.due_at)}
                    </small>
                  </button>
                ) : (
                  <p key={link.id}>연결된 업무를 읽지 못했습니다.</p>
                );
              })}
              {!links.length && (
                <p>
                  {data.linksComplete
                    ? "아직 연결된 업무가 없습니다."
                    : "연결 여부를 모두 확인하지 못했습니다."}
                </p>
              )}
            </section>
            {!taskId && (
              <fieldset disabled={busy || !canWrite} className={styles.form}>
                <legend>다음 행동으로 연결</legend>
                <label>
                  할 일 제목
                  <input
                    maxLength={300}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  프로젝트
                  <select
                    value={draft.projectId}
                    onChange={(event) =>
                      setDraft({ ...draft, projectId: event.target.value })
                    }
                  >
                    <option value="">프로젝트 선택</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  마감일
                  <input
                    type="date"
                    value={draft.dueAt}
                    onChange={(event) =>
                      setDraft({ ...draft, dueAt: event.target.value })
                    }
                  />
                </label>
                <p>계획 상태로 생성됩니다. 원본 메모는 연결된 채로 남습니다.</p>
                <Button
                  variant="primary"
                  onClick={() => save("create")}
                  disabled={busy || !canWrite}
                >
                  {busy ? "저장 중…" : "할 일로 만들기"}
                </Button>
                <div className={styles.existing}>
                  <label>
                    기존 업무에 연결
                    <select
                      value={draft.taskId}
                      onChange={(event) =>
                        setDraft({ ...draft, taskId: event.target.value })
                      }
                    >
                      <option value="">업무 선택</option>
                      {candidateTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    onClick={() => save("link")}
                    disabled={busy || !canWrite}
                  >
                    선택한 업무에 연결
                  </Button>
                </div>
              </fieldset>
            )}
            <p role="status" aria-live="polite" className={styles.notice}>
              {feedback}
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
