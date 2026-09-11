import { NextResponse } from "next/server";

import {
  createOrUpdateGoogleCalendarEvent,
  listGoogleCalendarEvents,
  recordGoogleCalendarSync,
} from "@/lib/google-calendar";
import { listMergedGoogleCalendarSourceEvents } from "@/lib/google-calendar-ical";
import { assertHubWriteAllowed, readHubWriteJson } from "@/lib/hub-write-guard";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Personal/Company feed items already look like Google event JSON (see
// google-calendar-ical.js#mapInstance) plus a `source` tag from the merge step.
function mapCalendarSourceEvent(item) {
  const mapped = mapGoogleEvent(item);
  return mapped ? { ...mapped, source: item.source } : null;
}

const OAUTH_NOT_CONNECTED_REASONS = new Set(["missing-connection", "missing-access-token"]);

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

  const now = new Date();
  const effectiveTimeMin = timeMin || now.toISOString();
  const effectiveTimeMax = timeMax || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Two independent read channels: the OAuth-connected calendar (also the only write
  // target) and the Personal/Company public-secret iCal feeds. Neither blocks the other —
  // an operator with no OAuth connection still sees both real feeds instead of "connect first".
  const [oauthResult, mergedResult] = await Promise.all([
    listGoogleCalendarEvents({ workspaceId, calendarId, timeMin, timeMax, maxResults: 60 }),
    listMergedGoogleCalendarSourceEvents({
      timeMin: effectiveTimeMin,
      timeMax: effectiveTimeMax,
      maxResults: 60,
    }),
  ]);

  const events = [
    ...(oauthResult.ok ? oauthResult.items.map(mapGoogleEvent).filter(Boolean) : []),
    ...mergedResult.items.map(mapCalendarSourceEvent).filter(Boolean),
  ].sort((a, b) => a.start.localeCompare(b.start));

  if (oauthResult.ok) {
    return NextResponse.json({
      status: "live",
      calendarId: oauthResult.calendarId,
      source: oauthResult.source || "oauth",
      readOnly: Boolean(oauthResult.readOnly),
      sources: mergedResult.sources,
      events,
    });
  }

  if (mergedResult.ok) {
    const failedSource = mergedResult.sources.find((source) => source.status !== "live");
    return NextResponse.json({
      status: mergedResult.status,
      source: "multi",
      readOnly: true,
      message: failedSource ? `${failedSource.label} 캘린더를 읽지 못했습니다.` : "",
      sources: mergedResult.sources,
      events,
    });
  }

  const status = OAUTH_NOT_CONNECTED_REASONS.has(oauthResult.reason) ? "preview" : "error";

  return NextResponse.json({
    status,
    message: status === "preview" ? "Google Calendar가 연결되지 않았습니다." : oauthResult.reason,
    sources: mergedResult.sources,
    events: [],
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
      return parsed.error;
    }

    const payload = buildPreview(parsed.data);

    if (!payload.workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          preview: payload,
        },
        { status: 202 },
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
        return NextResponse.json(
          {
            status: "preview",
            message: "Google Calendar is not connected yet. Preview only.",
            preview: payload,
            mutation,
          },
          { status: 202 },
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

      return NextResponse.json(
        {
          status: "error",
          error: mutation.reason || "Google Calendar mutation failed.",
          preview: payload,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: payload.eventId ? "updated" : "saved",
      message: payload.eventId
        ? "Google Calendar event updated."
        : "Google Calendar event created.",
      preview: payload,
      event: mutation.event,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await recordGoogleCalendarSync({
      workspaceId: resolveDefaultWorkspaceId(),
      status: "failure",
      payload: {
        provider: "google_calendar",
        action: "event_mutation",
      },
      errorMessage: message,
    }).catch(() => null);

    return NextResponse.json(
      {
        status: "error",
        error: message,
      },
      { status: 500 },
    );
  }
}
