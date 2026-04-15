"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export function EmailComposer({
  segments,
  initialSegmentId,
  templates,
  variables,
  blocks,
  channels,
  defaultWorkspaceId = "",
  initialTemplateId = "",
  initialRecipientName = "",
  initialSubject = "",
  initialBody = "",
  initialStatusMessage = "",
}) {
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
  const [templateId, setTemplateId] = useState(initialTemplateId || initialTemplate?.id || "");
  const template =
    templates.find((item) => item.id === templateId) ?? initialTemplate ?? null;

  const [recipientName, setRecipientName] = useState(
    initialRecipientName || initialSegment.sample?.lead_name || "",
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState(initialSubject || template?.subject || "");
  const [body, setBody] = useState(initialBody || defaultBodyForTemplate(template));
  const [activeField, setActiveField] = useState("body");
  const [statusMessage, setStatusMessage] = useState(
    initialStatusMessage || "변수 칩이나 블록을 클릭하면 커서 위치에 바로 삽입됩니다.",
  );
  const [pendingAction, setPendingAction] = useState("");
  const [result, setResult] = useState(null);

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    setSegmentId(initialSegmentId);
  }, [initialSegmentId]);

  useEffect(() => {
    if (!template) return;
    if (initialTemplateId && template.id === initialTemplateId) {
      setResult(null);
      setSubject(initialSubject || template.subject);
      setBody(initialBody || defaultBodyForTemplate(template));
      setStatusMessage(initialStatusMessage || `템플릿 "${template.name}" 로딩됨.`);
      return;
    }

    setSubject(template.subject);
    setBody(defaultBodyForTemplate(template));
    setResult(null);
    setStatusMessage(`템플릿 "${template.name}" 로딩됨.`);
  }, [template?.id, initialTemplateId, initialSubject, initialBody, initialStatusMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRecipientName(initialRecipientName || segment.sample?.lead_name || "");

    if (segment.audience === "any") return;
    if (template?.audience === segment.audience) return;
    const next = findMatchingTemplate(matchingTemplates, segment.audience);
    if (next) {
      setTemplateId(next.id);
      setStatusMessage(`${segment.label} 세그먼트에 맞춰 템플릿을 자동 추천했습니다.`);
    }
  }, [segmentId, initialRecipientName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialTemplateId && !initialRecipientName && !initialSubject && !initialBody && !initialStatusMessage) {
      return;
    }

    if (initialTemplateId) {
      setTemplateId(initialTemplateId);
    }
    if (initialRecipientName) {
      setRecipientName(initialRecipientName);
    }
    if (initialSubject) {
      setSubject(initialSubject);
    }
    if (initialBody) {
      setBody(initialBody);
    }
    if (initialStatusMessage) {
      setStatusMessage(initialStatusMessage);
    }
    setResult(null);
  }, [initialTemplateId, initialRecipientName, initialSubject, initialBody, initialStatusMessage]);

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
    setStatusMessage("초안을 템플릿 기본값으로 되돌렸습니다.");
  }

  function saveDraft() {
    setResult(null);
    setStatusMessage(
      `초안 저장 → "${template?.name ?? "Untitled"}" 의 사본으로 보관됩니다.`,
    );
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
