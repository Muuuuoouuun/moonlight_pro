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

export function EmailComposer({
  segments,
  initialSegmentId,
  templates,
  variables,
  blocks,
  channels,
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
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const template =
    templates.find((item) => item.id === templateId) ?? initialTemplate ?? null;

  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(defaultBodyForTemplate(template));
  const [activeField, setActiveField] = useState("body");
  const [statusMessage, setStatusMessage] = useState(
    "변수 칩이나 블록을 클릭하면 커서 위치에 바로 삽입됩니다.",
  );

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  // When the template changes, refresh subject + body so the operator never edits the wrong template by accident
  useEffect(() => {
    if (!template) return;
    setSubject(template.subject);
    setBody(defaultBodyForTemplate(template));
    setStatusMessage(`템플릿 "${template.name}" 로딩됨.`);
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the segment changes, snap the template back to one that fits the audience
  useEffect(() => {
    if (segment.audience === "any") return;
    if (template?.audience === segment.audience) return;
    const next = findMatchingTemplate(matchingTemplates, segment.audience);
    if (next) {
      setTemplateId(next.id);
      setStatusMessage(`${segment.label} 세그먼트에 맞춰 템플릿을 자동 추천했습니다.`);
    }
  }, [segmentId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setStatusMessage("초안을 템플릿 기본값으로 되돌렸습니다.");
  }

  function dryRunPreview() {
    setStatusMessage(
      `Dry-run 준비 완료 → ${channelLabel(channels, template?.channel)} 채널 / ${segment.label} (${segment.count}명) — 실제 발송 전 검수 단계입니다.`,
    );
  }

  function scheduleSend() {
    setStatusMessage(
      `예약 큐에 올리기 → ${segment.label} (${segment.count}명) · ${channelLabel(channels, template?.channel)}. 백엔드 연결 후 실제 enqueue 됩니다.`,
    );
  }

  function saveDraft() {
    setStatusMessage(
      `초안 저장 → "${template?.name ?? "Untitled"}" 의 사본으로 보관됩니다.`,
    );
  }

  const sample = segment.sample;
  const subjectPreview = resolveVariables(subject, sample);
  const bodyPreview = resolveVariables(body, sample);
  const usedTokens = listUsedTokens(`${subject}\n${body}`);
  const totalChars = body.length;

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
            <button type="button" className="button button-secondary" onClick={dryRunPreview}>
              Dry-run
            </button>
            <button type="button" className="button button-primary" onClick={scheduleSend}>
              발송 예약
            </button>
          </div>
          <p className="composer-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>

        <aside className="composer-preview">
          <div className="composer-preview-head">
            <span className="chip">미리보기</span>
            <span className="chip">{channelLabel(channels, template?.channel)}</span>
          </div>
          <dl className="composer-preview-meta">
            <div>
              <dt>To</dt>
              <dd>
                {segment.label} · {segment.count.toLocaleString()}명
              </dd>
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

function channelLabel(channels, channelId) {
  return channels.find((item) => item.id === channelId)?.name ?? channelId ?? "—";
}
