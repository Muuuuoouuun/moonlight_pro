"use client";

import { useState } from "react";

function normalizeResponseTone(status) {
  if (status === "sent") {
    return "green";
  }

  if (status === "preview") {
    return "warning";
  }

  return "danger";
}

export function WebhookTestForm({ defaultWorkspaceId = "", defaultEngineUrl = "" }) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/webhooks/project-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        status: "error",
        error: String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="action-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field field-span-2">
          <span>Engine URL</span>
          <input
            className="field-input"
            defaultValue={defaultEngineUrl}
            name="engineUrl"
            placeholder="예: http://localhost:3001"
          />
        </label>

        <label className="field">
          <span>Workspace ID</span>
          <input
            className="field-input"
            defaultValue={defaultWorkspaceId}
            name="workspaceId"
            placeholder="default workspace env or explicit UUID"
          />
        </label>

        <label className="field">
          <span>Project ID</span>
          <input className="field-input" name="projectId" placeholder="optional linked project UUID" />
        </label>

        <label className="field field-span-2">
          <span>Webhook Title</span>
          <input className="field-input" defaultValue="Project webhook smoke test" name="title" required />
        </label>

        <label className="field field-span-2">
          <span>Summary</span>
          <textarea
            className="field-textarea"
            defaultValue="Smoke test fired from Hub OS to confirm project progress intake."
            name="summary"
            rows={3}
          />
        </label>

        <label className="field">
          <span>Status</span>
          <select className="field-input" defaultValue="active" name="status">
            <option value="reported">reported</option>
            <option value="active">active</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
        </label>

        <label className="field">
          <span>Progress</span>
          <input className="field-input" defaultValue="65" max="100" min="0" name="progress" type="number" />
        </label>

        <label className="field field-span-2">
          <span>Next Action</span>
          <input className="field-input" defaultValue="Verify webhook persistence in automation and log views." name="nextAction" />
        </label>

        <label className="field">
          <span>Check Type</span>
          <select className="field-input" defaultValue="midday" name="checkType">
            <option value="">none</option>
            <option value="morning">morning</option>
            <option value="midday">midday</option>
            <option value="evening">evening</option>
            <option value="weekly">weekly</option>
          </select>
        </label>
      </div>

      <div className="form-actions">
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? "Sending..." : "Send Webhook Smoke Test"}
        </button>
        <p className="form-note">
          엔진 URL이 설정되어 있으면 실제 project webhook으로 전송하고, 없으면 preview 응답을 돌려줍니다.
        </p>
      </div>

      {result ? (
        <div className="status-note" data-tone={normalizeResponseTone(result.status)}>
          <strong>{result.status === "sent" ? "Sent" : result.status === "preview" ? "Preview" : "Error"}</strong>
          <p>{result.message || result.error || "Unknown response"}</p>
          {result.target ? <p className="status-note-subtle">Target: {result.target}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
