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

export function ProjectUpdateForm({ defaultWorkspaceId = "" }) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/projects/update", {
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

        <label className="field field-span-2">
          <span>Update Title</span>
          <input className="field-input" name="title" placeholder="예: Hub OS activation milestone updated" required />
        </label>

        <label className="field field-span-2">
          <span>Summary</span>
          <textarea className="field-textarea" name="summary" placeholder="무엇이 움직였는지 짧고 분명하게 기록" rows={4} />
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
          <input className="field-input" defaultValue="55" max="100" min="0" name="progress" type="number" />
        </label>

        <label className="field field-span-2">
          <span>Milestone</span>
          <input className="field-input" name="milestone" placeholder="현재 마일스톤 또는 단계" />
        </label>

        <label className="field field-span-2">
          <span>Next Action</span>
          <textarea className="field-textarea" name="nextAction" placeholder="다음으로 실제 해야 할 행동 한 줄" rows={3} />
        </label>
      </div>

      <div className="form-actions">
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? "Saving..." : "Save Project Update"}
        </button>
        <p className="form-note">
          Workspace env가 없으면 preview 모드로 응답하고, 있으면 Supabase에 바로 적재합니다.
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
