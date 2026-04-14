"use client";

import { useState } from "react";

function normalizeResponseTone(status) {
  if (status === "saved") {
    return "green";
  }

  if (status === "preview") {
    return "warning";
  }

  return "danger";
}

export function RoutineCheckForm({ defaultWorkspaceId = "" }) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/routine/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setResult(data);

      if (data.status === "saved") {
        event.currentTarget.reset();
      }
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

        <label className="field">
          <span>Check Type</span>
          <select className="field-input" defaultValue="midday" name="checkType">
            <option value="morning">morning</option>
            <option value="midday">midday</option>
            <option value="evening">evening</option>
            <option value="weekly">weekly</option>
          </select>
        </label>

        <label className="field">
          <span>Status</span>
          <select className="field-input" defaultValue="done" name="status">
            <option value="pending">pending</option>
            <option value="done">done</option>
            <option value="skipped">skipped</option>
            <option value="blocked">blocked</option>
          </select>
        </label>

        <label className="field field-span-2">
          <span>Note</span>
          <textarea className="field-textarea" name="note" placeholder="이번 체크에서 확인한 사실, 막힌 점, 다음 조정" rows={4} />
        </label>
      </div>

      <div className="form-actions">
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? "Saving..." : "Save Routine Check"}
        </button>
        <p className="form-note">
          PMS 체크는 morning, midday, evening, weekly 네 가지 리듬으로 바로 기록됩니다.
        </p>
      </div>

      {result ? (
        <div className="status-note" data-tone={normalizeResponseTone(result.status)}>
          <strong>{result.status === "saved" ? "Saved" : result.status === "preview" ? "Preview" : "Error"}</strong>
          <p>{result.message || result.error || "Unknown response"}</p>
        </div>
      ) : null}
    </form>
  );
}
