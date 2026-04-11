import { NextResponse } from "next/server";

import {
  createOrUpdateGoogleCalendarEvent,
  recordGoogleCalendarSync,
} from "@/lib/google-calendar";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

export const runtime = "nodejs";

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "on";
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
    const payload = buildPreview(await req.json());

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
