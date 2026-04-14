"use client";

export function GoogleCalendarConnectForm({
  defaultWorkspaceId = "",
  defaultCalendarId = "primary",
  status = "planned",
  detail = "",
}) {
  return (
    <form action="/api/calendar/google/connect" className="action-form" method="GET">
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
            placeholder="primary or your calendar ID"
          />
        </label>

        <input name="returnPath" type="hidden" value="/dashboard/work/calendar" />
      </div>

      <div className="form-actions">
        <button className="button button-primary" type="submit">
          {status === "connected" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </button>
        <p className="form-note">
          Google OAuth로 연결한 뒤 이 캘린더의 일정 생성과 수정이 가능해집니다. {detail || ""}
        </p>
      </div>
    </form>
  );
}
