import { NextResponse } from "next/server";

import {
  createOrUpdateGoogleCalendarEvent,
  listGoogleCalendarEvents,
  recordGoogleCalendarSync,
} from "@/lib/google-calendar";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { classifyWritePersistence } from "@/lib/write-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writeResponse(persistence, details = {}) {
  const classification = classifyWritePersistence(persistence);

  return NextResponse.json(
    {
      ...details,
      ...classification,
    },
    { status: classification.httpStatus },
  );
}

async function writeInputError(response) {
  const details = await response.json().catch(() => ({}));
  const reason = response.status === 413 ? "payload-too-large" : "invalid-json";

  return writeResponse({ persisted: false, reason }, details);
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "on";
}

// Google's event.start is { dateTime, timeZone } for timed events or { date } for
// all-day — normalize both into an ISO start/end pair the Hub calendar grid can plot.
function normalizeEventTime(point) {
  if (!point) return null;
  if (point.dateTime) return point.dateTime;
  if (point.date) return `${point.date}T00:00:00`;
  return null;
}

function mapGoogleEvent(event) {
  const start = normalizeEventTime(event.start);
  const end = normalizeEventTime(event.end) || start;
  if (!start) return null;

  return {
    id: event.id,
    title: event.summary || "(제목 없음)",
    start,
    end,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    location: event.location || null,
    htmlLink: event.htmlLink || null,
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") || resolveDefaultWorkspaceId();
  const timeMin = searchParams.get("timeMin") || undefined;
  const timeMax = searchParams.get("timeMax") || undefined;
  const calendarId = searchParams.get("calendarId") || undefined;

  if (!workspaceId) {
    return NextResponse.json({
      status: "preview",
      message: "Workspace ID is not configured yet.",
      events: [],
    });
  }

  const result = await listGoogleCalendarEvents({ workspaceId, calendarId, timeMin, timeMax, maxResults: 60 });

  if (!result.ok) {
    const status = result.reason === "missing-connection" || result.reason === "missing-access-token"
      ? "preview"
      : "error";

    return NextResponse.json({
      status,
      message: status === "preview" ? "Google Calendar가 연결되지 않았습니다." : result.reason,
      events: [],
    });
  }

  return NextResponse.json({
    status: "live",
    calendarId: result.calendarId,
    events: result.items.map(mapGoogleEvent).filter(Boolean),
  });
}

function buildPreview(payload) {
  const workspaceId = String(payload.workspaceId || resolveDefaultWorkspaceId()).trim();
  const startAt = String(payload.startAt || "").trim();
  const endAt = String(payload.endAt || "").trim() || startAt;

  return {
    workspaceId,
    calendarId: String(payload.calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary").trim(),
    eventId: String(payload.eventId || "").trim() || null,
    title: String(payload.title || "").trim() || "Com_Moon schedule",
    description: String(payload.description || "").trim() || null,
    location: String(payload.location || "").trim() || null,
    startAt,
    endAt,
    allDay: normalizeBoolean(payload.allDay),
    timeZone: String(payload.timeZone || "Asia/Seoul").trim() || "Asia/Seoul",
  };
}

export async function POST(req) {
  try {
    const guard = assertHubWriteAllowed(req);
    if (guard) {
      return guard;
    }

    const parsed = await readHubWriteJson(req);
    if (parsed.error) {
      return writeInputError(parsed.error);
    }

    if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        { error: "Request body must be a JSON object." },
      );
    }

    const payload = buildPreview(parsed.data);

    if (!payload.workspaceId) {
      return writeResponse(
        { persisted: false, reason: "missing-workspace" },
        {
          message: "Workspace ID is required before a Google Calendar event can be saved.",
          preview: payload,
        },
      );
    }

    if (!payload.startAt) {
      return writeResponse(
        { persisted: false, reason: "validation" },
        {
          error: "startAt is required to save a Google Calendar event.",
          preview: payload,
        },
      );
    }

    const mutation = await createOrUpdateGoogleCalendarEvent({
      workspaceId: payload.workspaceId,
      calendarId: payload.calendarId,
      eventId: payload.eventId,
      input: payload,
    });

    if (!mutation.ok) {
      if (mutation.reason === "missing-connection" || mutation.reason === "missing-access-token") {
        return writeResponse(
          { persisted: false, reason: mutation.reason },
          {
            message: "Google Calendar must be connected before an event can be saved.",
            preview: payload,
            mutation,
          },
        );
      }

      await recordGoogleCalendarSync({
        workspaceId: payload.workspaceId,
        connectionId: mutation.connection?.id || null,
        status: "failure",
        payload: {
          provider: "google_calendar",
          action: payload.eventId ? "update" : "create",
          title: payload.title,
        },
        errorMessage: mutation.reason,
      });

      return writeResponse(
        { persisted: false, reason: mutation.reason || "upstream-failed" },
        {
          error: mutation.reason || "Google Calendar mutation failed.",
          preview: payload,
          mutation,
        },
      );
    }

    return writeResponse(
      { persisted: true, reason: mutation.reason || "ok" },
      {
        message: payload.eventId
          ? "Google Calendar event updated."
          : "Google Calendar event created.",
        action: payload.eventId ? "updated" : "created",
        preview: payload,
        event: mutation.event,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const upstreamStatus = Number.isInteger(error?.httpStatus) &&
      error.httpStatus >= 400 &&
      error.httpStatus <= 599
      ? error.httpStatus
      : null;

    await recordGoogleCalendarSync({
      workspaceId: resolveDefaultWorkspaceId(),
      status: "failure",
      payload: {
        provider: "google_calendar",
        action: "event_mutation",
      },
      errorMessage: message,
    }).catch(() => null);

    return writeResponse(
      {
        persisted: false,
        reason: upstreamStatus
          ? `http-${upstreamStatus}`
          : /timeout/i.test(message)
          ? "timeout"
          : "upstream-failed",
      },
      {
        error: message,
        ...(upstreamStatus ? { upstreamStatus } : {}),
      },
    );
  }
}
