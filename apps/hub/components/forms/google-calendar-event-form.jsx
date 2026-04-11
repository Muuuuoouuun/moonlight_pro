"use client";

import { useState } from "react";

function normalizeResponseTone(status) {
  if (status === "saved" || status === "updated") {
    return "green";
  }

  if (status === "preview") {
    return "warning";
  }

  return "danger";
}

function getDefaultDateTime(offsetHours = 1) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function GoogleCalendarEventForm({
  defaultWorkspaceId = "",
  defaultCalendarId = "primary",
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.allDay = formData.get("allDay") === "on";

    try {
      const response = await fetch("/api/calendar/google/event", {
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
          <span>Google Calendar ID</span>
          <input
            className="field-input"
            defaultValue={defaultCalendarId}
            name="calendarId"
            placeholder="primary or shared calendar ID"
          />
        </label>

        <label className="field field-span-2">
          <span>Title</span>
          <input className="field-input" defaultValue="Shared work block" name="title" required />
        </label>

        <label className="field">
          <span>Start</span>
          <input className="field-input" defaultValue={getDefaultDateTime(1)} name="startAt" type="datetime-local" required />
        </label>

        <label className="field">
          <span>End</span>
          <input className="field-input" defaultValue={getDefaultDateTime(2)} name="endAt" type="datetime-local" required />
        </label>

        <label className="field field-span-2">
          <span>Description</span>
          <textarea
            className="field-textarea"
            defaultValue="Created from Com_Moon Hub calendar."
            name="description"
            rows={3}
          />
        </label>

        <label className="field">
          <span>Location</span>
          <input className="field-input" name="location" placeholder="optional meeting place or call link" />
        </label>

        <label className="field">
          <span>Google Event ID</span>
          <input className="field-input" name="eventId" placeholder="optional: fill to update existing event" />
        </label>

        <label className="field">
          <span>Time Zone</span>
          <input className="field-input" defaultValue="Asia/Seoul" name="timeZone" />
        </label>

        <label className="field">
          <span>All Day</span>
          <label className="field-checkbox">
            <input name="allDay" type="checkbox" />
            <span>Create as all-day event</span>
          </label>
        </label>
      </div>

      <div className="form-actions">
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? "Saving..." : "Create or Update Google Event"}
        </button>
        <p className="form-note">
          이벤트 ID를 비워두면 새 일정이 생성되고, 입력하면 해당 Google 일정을 수정합니다.
        </p>
      </div>

      {result ? (
        <div className="status-note" data-tone={normalizeResponseTone(result.status)}>
          <strong>
            {result.status === "saved"
              ? "Saved"
              : result.status === "updated"
                ? "Updated"
                : result.status === "preview"
                  ? "Preview"
                  : "Error"}
          </strong>
          <p>{result.message || result.error || "Unknown response"}</p>
          {result.event?.htmlLink ? (
            <p className="status-note-subtle">Open event: {result.event.htmlLink}</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
