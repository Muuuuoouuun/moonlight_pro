"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EMAIL_DRAFT_STORAGE_KEY_PREFIX = "com-moon:email-composer-draft:v1";

function findMatchingTemplate(templates, audience) {
  return (
    templates.find((item) => item.audience === audience) ??
    templates.find((item) => item.status === "ready") ??
    templates[0] ??
    null
  );
}

function resolveVariables(text, sample) {
  if (!text) return "";
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => {
    if (Object.prototype.hasOwnProperty.call(sample, key)) {
      return sample[key];
    }
    return token;
  });
}

function listUsedTokens(text) {
  if (!text) return [];
  const seen = new Set();
  const matches = text.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
  for (const match of matches) {
    seen.add(match[1]);
  }
  return Array.from(seen);
}

function defaultBodyForTemplate(template) {
  if (!template) {
    return "{{lead_name}}님, 안녕하세요.\n\n본문을 작성하세요.\n\n— {{signature}}\n";
  }

  if (template.id === "lead-followup-warm") {
    return "{{lead_name}}님, 안녕하세요.\n\n남겨주신 문의 잘 확인했습니다.\n이번 주 안에 짧게 통화 한 번 가능하실까요?\n\n[ {{cta_label}} ]\n\n— {{signature}}\n";
  }

  if (template.id === "weekly-brief") {
    return "{{lead_name}}님, 안녕하세요.\n\n{{week_label}} 운영 브리프입니다.\n\n- 이번 주 가장 강하게 움직인 신호 한 가지\n- 그에 따라 결정된 다음 액션\n- 다음 주 우선순위\n\n[ {{cta_label}} ]\n\n— {{signature}}\n";
  }

  if (template.id === "publish-handoff") {
    return "{{lead_name}}님, 안녕하세요.\n\n{{brand}} 카드뉴스 배포가 완료되었습니다.\n발송 노트와 캡션 가이드는 첨부 링크에서 확인하실 수 있습니다.\n\n[ {{cta_label}} ]\n\n— {{signature}}\n";
  }

  if (template.id === "personal-intro") {
    return "{{lead_name}}, 안녕하세요. 문준혁입니다.\n\n오늘 짧게 인사드리고 싶어 메일 드립니다.\n다음 주 잠깐 차 한 잔 가능하실까요?\n\n— {{signature}}\n";
  }

  return `${template.subject}\n\n본문을 작성하세요.\n\n— {{signature}}\n`;
}

function channelLabel(channels, channelId) {
  return channels.find((item) => item.id === channelId)?.name ?? channelId ?? "—";
}

function normalizeResponseTone(status) {
  if (status === "sent") {
    return "green";
  }

  if (status === "preview") {
    return "warning";
  }

  return "danger";
}

function responseTitle(status) {
  if (status === "sent") {
    return "발송 완료";
  }

  if (status === "preview") {
    return "Dry-run 완료";
  }

  return "발송 오류";
}

function previewRecipient(segment, recipientName, recipientEmail) {
  if (!recipientEmail) {
    return `${segment.label} · ${segment.count.toLocaleString()}명`;
  }

  return recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail;
}

function formatDraftTimestamp(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function readStoredDraft(storageKey) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function EmailComposer({
  segments,
  initialSegmentId,
  templates,
  variables,
  blocks,
  channels,
  defaultWorkspaceId = "",
}) {
  const storageKey = `${EMAIL_DRAFT_STORAGE_KEY_PREFIX}:${defaultWorkspaceId || "local"}`;
  const initialSegment =
    segments.find((item) => item.id === initialSegmentId) ?? segments[0];
  const [segmentId, setSegmentId] = useState(initialSegment.id);
  const segment = segments.find((item) => item.id === segmentId) ?? initialSegment;

  const matchingTemplates = useMemo(() => {
    if (segment.audience === "any") return templates;
    return templates.filter((item) => item.audience === segment.audience);
  }, [templates, segment]);

  const initialTemplate = findMatchingTemplate(
    matchingTemplates.length ? matchingTemplates : templates,
    segment.audience,
  );
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const template =
    templates.find((item) => item.id === templateId) ?? initialTemplate ?? null;

  const [recipientName, setRecipientName] = useState(initialSegment.sample?.lead_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(defaultBodyForTemplate(template));
  const [activeField, setActiveField] = useState("body");
  const [statusMessage, setStatusMessage] = useState(
    "변수 칩이나 블록을 클릭하면 커서 위치에 바로 삽입됩니다.",
  );
  const [pendingAction, setPendingAction] = useState("");
  const [result, setResult] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState("");

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const skipTemplateSyncRef = useRef(false);
  const skipSegmentSyncRef = useRef(false);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    if (!template) return;
    if (skipTemplateSyncRef.current) {
      skipTemplateSyncRef.current = false;
      return;
    }
    setSubject(template.subject);
    setBody(defaultBodyForTemplate(template));
    setResult(null);
    setStatusMessage(`템플릿 "${template.name}" 로딩됨.`);
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipSegmentSyncRef.current) {
      skipSegmentSyncRef.current = false;
      return;
    }

    setRecipientName(segment.sample?.lead_name ?? "");

    if (segment.audience === "any") return;
    if (template?.audience === segment.audience) return;
    const next = findMatchingTemplate(matchingTemplates, segment.audience);
    if (next) {
      setTemplateId(next.id);
      setStatusMessage(`${segment.label} 세그먼트에 맞춰 템플릿을 자동 추천했습니다.`);
    }
  }, [segmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const savedDraft = readStoredDraft(storageKey);
    draftHydratedRef.current = true;

    if (!savedDraft) {
      return;
    }

    const nextSegmentId =
      segments.find((item) => item.id === savedDraft.segmentId)?.id ?? initialSegment.id;
    const nextTemplateId =
      templates.find((item) => item.id === savedDraft.templateId)?.id ?? initialTemplate?.id ?? "";

    skipSegmentSyncRef.current = true;
    skipTemplateSyncRef.current = true;

    setSegmentId(nextSegmentId);
    setTemplateId(nextTemplateId);
    setRecipientName(savedDraft.recipientName ?? initialSegment.sample?.lead_name ?? "");
    setRecipientEmail(savedDraft.recipientEmail ?? "");
    setSubject(savedDraft.subject ?? initialTemplate?.subject ?? "");
    setBody(savedDraft.body ?? defaultBodyForTemplate(initialTemplate));
    setActiveField(savedDraft.activeField === "subject" ? "subject" : "body");
    setLastSavedAt(savedDraft.updatedAt ?? "");
    setStatusMessage(
      savedDraft.updatedAt
        ? `로컬 초안 복구됨 · ${formatDraftTimestamp(savedDraft.updatedAt)}`
        : "로컬 초안 복구됨",
    );
  }, [initialSegment.id, initialSegment.sample?.lead_name, initialTemplate, segments, storageKey, templates]);

  useEffect(() => {
    if (!draftHydratedRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const updatedAt = new Date().toISOString();
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            segmentId,
            templateId,
            recipientName,
            recipientEmail,
            subject,
            body,
            activeField,
            updatedAt,
          }),
        );
        setLastSavedAt(updatedAt);
      } catch {
        // Ignore localStorage failures without breaking the form.
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeField,
    body,
    recipientEmail,
    recipientName,
    segmentId,
    storageKey,
    subject,
    templateId,
  ]);

  function insertAtCursor(token) {
    const isSubject = activeField === "subject";
    const ref = isSubject ? subjectRef.current : bodyRef.current;
    const setter = isSubject ? setSubject : setBody;
    const value = isSubject ? subject : body;

    if (!ref) {
      setter(value + token);
      return;
    }

    const start = ref.selectionStart ?? value.length;
    const end = ref.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setter(next);

    requestAnimationFrame(() => {
      if (!ref) return;
      const cursor = start + token.length;
      ref.focus();
      ref.setSelectionRange(cursor, cursor);
    });

    setStatusMessage(`${token} 삽입됨 — 미리보기에서 즉시 치환됩니다.`);
  }

  function insertBlockAtBody(block) {
    const ref = bodyRef.current;
    if (!ref) {
      setBody((current) => current + block.body);
      return;
    }
    const start = ref.selectionStart ?? body.length;
    const end = ref.selectionEnd ?? body.length;
    const next = body.slice(0, start) + block.body + body.slice(end);
    setBody(next);
    setActiveField("body");

    requestAnimationFrame(() => {
      const ref2 = bodyRef.current;
      if (!ref2) return;
      const cursor = start + block.body.length;
      ref2.focus();
      ref2.setSelectionRange(cursor, cursor);
    });

    setStatusMessage(`블록 "${block.label}" 삽입됨.`);
  }

  function resetDraft() {
    if (!template) return;
    setSubject(template.subject);
    setBody(defaultBodyForTemplate(template));
    setResult(null);
    try {
      window.localStorage.removeItem(storageKey);
      setLastSavedAt("");
    } catch {
      // Ignore localStorage failures during reset.
    }
    setStatusMessage("초안을 템플릿 기본값으로 되돌렸습니다.");
  }

  function saveDraft() {
    const updatedAt = new Date().toISOString();

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          segmentId,
          templateId,
          recipientName,
          recipientEmail,
          subject,
          body,
          activeField,
          updatedAt,
        }),
      );
      setLastSavedAt(updatedAt);
    } catch {
      // Ignore localStorage failures on manual save.
    }

    setResult(null);
    setStatusMessage(
      `초안 저장됨 · ${formatDraftTimestamp(updatedAt)} · "${template?.name ?? "Untitled"}"`,
    );
  }

  function applySegmentSample() {
    if (!template) {
      setStatusMessage("템플릿을 먼저 고르세요.");
      return;
    }

    setRecipientName(segment.sample?.lead_name ?? "");
    setSubject(template.subject);
    setBody(defaultBodyForTemplate(template));
    setActiveField("body");
    setResult(null);
    setStatusMessage(
      `${segment.label} 샘플값을 다시 채웠습니다. 수신 이메일만 입력하면 바로 dry-run 할 수 있습니다.`,
    );

    requestAnimationFrame(() => {
      bodyRef.current?.focus();
    });
  }

  async function copyToClipboard(value, label) {
    if (!value.trim()) {
      setStatusMessage(`${label}이 비어 있어 복사할 내용이 없습니다.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} 복사됨.`);
    } catch {
      setStatusMessage(`${label} 복사 실패. 브라우저 권한을 확인하세요.`);
    }
  }

  async function runDeliveryAction(action) {
    if (!template) {
      setResult({
        status: "error",
        error: "템플릿을 먼저 고르세요.",
      });
      setStatusMessage("템플릿을 먼저 고르세요.");
      return;
    }

    if (!recipientEmail.trim()) {
      setResult({
        status: "error",
        error: "수신 이메일을 입력해야 dry-run 또는 실발송이 가능합니다.",
      });
      setStatusMessage("수신 이메일을 입력해야 dry-run 또는 실발송이 가능합니다.");
      return;
    }

    setPendingAction(action);

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          workspaceId: defaultWorkspaceId,
          channel: template.channel,
          recipientEmail,
          recipientName,
          subject,
          body,
          fromName: sample.signature,
          templateId: template.id,
          templateName: template.name,
          segmentId: segment.id,
          segmentLabel: segment.label,
          audience: segment.audience,
        }),
      });

      const data = await response.json();
      setResult(data);

      if (data.status === "sent") {
        try {
          window.localStorage.removeItem(storageKey);
          setLastSavedAt("");
        } catch {
          // Ignore storage cleanup failures after send.
        }
        setStatusMessage(`실발송 완료 → ${channelLabel(channels, template.channel)} 채널.`);
        return;
      }

      if (data.status === "preview") {
        setStatusMessage(
          `Dry-run 완료 → ${channelLabel(channels, template.channel)} 채널 준비 상태를 확인했습니다.`,
        );
        return;
      }

      setStatusMessage(data.error || data.message || "발송 중 오류가 발생했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({
        status: "error",
        error: message,
      });
      setStatusMessage(message);
    } finally {
      setPendingAction("");
    }
  }

  const sample = segment.sample;
  const subjectPreview = resolveVariables(subject, sample);
  const bodyPreview = resolveVariables(body, sample);
  const usedTokens = listUsedTokens(`${subject}\n${body}`);
  const totalChars = body.length;
  const liveSendDisabled = pendingAction === "send" || template?.channel === "n8n";
  const dryRunDisabled = pendingAction === "dry-run";
  const saveStatusLabel = lastSavedAt ? `자동 저장 ${formatDraftTimestamp(lastSavedAt)}` : "로컬 초안 없음";
  const previewMailText = [
    `To: ${previewRecipient(segment, recipientName, recipientEmail)}`,
    `From: ${sample.signature}`,
    `Subject: ${subjectPreview || "—"}`,
    "",
    bodyPreview || "—",
  ].join("\n");

  useEffect(() => {
    const handleShortcut = (event) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (!isModifierPressed) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        saveDraft();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();

        if (event.shiftKey) {
          if (!liveSendDisabled) {
            void runDeliveryAction("send");
          }
          return;
        }

        if (!dryRunDisabled) {
          void runDeliveryAction("dry-run");
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [dryRunDisabled, liveSendDisabled, pendingAction, recipientEmail, saveDraft, subject, body]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="composer-shell">
      <div className="composer-segment-strip" role="tablist" aria-label="Audience segments">
        {segments.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === segmentId}
            className="composer-segment-chip"
            data-active={item.id === segmentId}
            data-tone={item.tone}
            onClick={() => setSegmentId(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.count.toLocaleString()}명</span>
          </button>
        ))}
      </div>
      <p className="composer-segment-note">{segment.note}</p>

      <div className="composer-grid">
        <div className="composer-editor">
          <div className="composer-field">
            <label className="composer-label" htmlFor="composer-template">
              템플릿
            </label>
            <select
              id="composer-template"
              className="composer-select"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {(matchingTemplates.length ? matchingTemplates : templates).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.audience}
                </option>
              ))}
            </select>
          </div>

          <div className="composer-field">
            <label className="composer-label" htmlFor="composer-recipient-name">
              수신자 이름
            </label>
            <input
              id="composer-recipient-name"
              className="composer-input"
              type="text"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              placeholder="예: 문준혁"
            />
          </div>

          <div className="composer-field">
            <label className="composer-label" htmlFor="composer-recipient-email">
              수신 이메일
            </label>
            <input
              id="composer-recipient-email"
              className="composer-input"
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="control inbox 또는 실제 수신자 이메일"
            />
            <p className="muted tiny">
              첫 버전은 명시적인 1명 수신 기준으로 dry-run / 즉시 발송만 연결합니다.
            </p>
          </div>

          <div className="composer-field">
            <label className="composer-label" htmlFor="composer-subject">
              제목
            </label>
            <input
              id="composer-subject"
              ref={subjectRef}
              className="composer-input"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              onFocus={() => setActiveField("subject")}
              placeholder="제목을 입력하거나 변수를 삽입하세요"
            />
          </div>

          <div className="composer-field">
            <span className="composer-label">변수 (클릭하면 커서 위치에 삽입)</span>
            <div className="composer-token-row">
              {variables.map((variable) => (
                <button
                  key={variable.token}
                  type="button"
                  className="composer-token-chip"
                  data-active={usedTokens.includes(variable.token.replace(/[{}]/g, "").trim())}
                  onClick={() => insertAtCursor(variable.token)}
                  title={variable.description}
                >
                  <code>{variable.token}</code>
                  <span>{variable.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="composer-field">
            <label className="composer-label" htmlFor="composer-body">
              본문
            </label>
            <textarea
              id="composer-body"
              ref={bodyRef}
              className="composer-textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onFocus={() => setActiveField("body")}
              spellCheck="false"
              placeholder="본문을 작성하거나 블록을 삽입하세요"
            />
            <div className="composer-meta">
              <span>{totalChars.toLocaleString()} chars</span>
              <span>변수 {usedTokens.length}개 사용</span>
              <span>활성 입력: {activeField === "subject" ? "제목" : "본문"}</span>
            </div>
          </div>

          <div className="composer-field">
            <span className="composer-label">블록 라이브러리 (본문에 즉시 삽입)</span>
            <div className="composer-block-row">
              {blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className="composer-block-chip"
                  onClick={() => insertBlockAtBody(block)}
                >
                  <strong>{block.label}</strong>
                  <span>{block.body.trim().split("\n")[0].slice(0, 26)}…</span>
                </button>
              ))}
            </div>
          </div>

          <div className="hero-actions" aria-label="Composer quick actions">
            <button type="button" className="button button-ghost" onClick={applySegmentSample}>
              샘플 다시 채우기
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void copyToClipboard(subjectPreview, "제목")}
            >
              제목 복사
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void copyToClipboard(bodyPreview, "본문")}
            >
              본문 복사
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void copyToClipboard(previewMailText, "미리보기")}
            >
              미리보기 복사
            </button>
          </div>

          <div className="composer-actions">
            <button type="button" className="button button-ghost" onClick={resetDraft}>
              초안 리셋
            </button>
            <button type="button" className="button button-ghost" onClick={saveDraft}>
              초안 저장
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={dryRunDisabled}
              onClick={() => void runDeliveryAction("dry-run")}
            >
              {pendingAction === "dry-run" ? "Dry-run 중..." : "Dry-run"}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={liveSendDisabled}
              onClick={() => void runDeliveryAction("send")}
            >
              {template?.channel === "n8n"
                ? "n8n 예정"
                : pendingAction === "send"
                  ? "발송 중..."
                : "즉시 발송"}
            </button>
          </div>
          <div className="composer-helper-row">
            <span className="composer-helper-chip">{saveStatusLabel}</span>
            <span className="composer-helper-chip">⌘/Ctrl + S 저장</span>
            <span className="composer-helper-chip">⌘/Ctrl + Enter dry-run</span>
            <span className="composer-helper-chip">Shift + ⌘/Ctrl + Enter 발송</span>
          </div>
          <p className="composer-status" role="status" aria-live="polite">
            {statusMessage}
          </p>

          {result ? (
            <div className="status-note" data-tone={normalizeResponseTone(result.status)}>
              <strong>{responseTitle(result.status)}</strong>
              <p>{result.message || result.error || "응답을 해석하지 못했습니다."}</p>
              {result.preview?.from ? (
                <p className="status-note-subtle">
                  {result.preview.from} → {(result.preview.to || []).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="composer-preview">
          <div className="composer-preview-head">
            <span className="chip">미리보기</span>
            <span className="chip">{channelLabel(channels, template?.channel)}</span>
          </div>
          <dl className="composer-preview-meta">
            <div>
              <dt>To</dt>
              <dd>{previewRecipient(segment, recipientName, recipientEmail)}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{sample.signature}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{subjectPreview || "—"}</dd>
            </div>
          </dl>
          <pre className="composer-preview-body">{bodyPreview}</pre>
          <div className="composer-preview-foot">
            {usedTokens.length === 0 ? (
              <span className="muted tiny">변수 없이 발송됩니다.</span>
            ) : (
              usedTokens.map((token) => (
                <span key={token} className="endpoint-pill">
                  <span>var</span>
                  <code>{`{{${token}}}`}</code>
                </span>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
