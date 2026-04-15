import { NextResponse } from "next/server";

import {
  buildAiCouncilTurns,
  formatAiClock,
  getAiCouncilStatusLabel,
  normalizeAiCouncilMembers,
} from "@/lib/ai-console";
import {
  insertSupabaseRecord,
  insertSupabaseRecords,
  resolveDefaultWorkspaceId,
} from "@/lib/server-write";

export const runtime = "nodejs";

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function buildSessionPreview(sessionId, topic, members, turns) {
  return {
    id: sessionId,
    topic,
    members,
    status: getAiCouncilStatusLabel("active"),
    tone: "blue",
    turns,
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
    const topic = normalizeString(payload.topic);
    const context = normalizeString(payload.context);
    const members = normalizeAiCouncilMembers(payload.members);
    const turns = buildAiCouncilTurns({ topic, context, members, timeLabel: formatAiClock() });

    if (!topic) {
      return NextResponse.json(
        {
          status: "error",
          error: "Council topic is required.",
        },
        { status: 400 },
      );
    }

    if (!members.length) {
      return NextResponse.json(
        {
          status: "error",
          error: "At least one council member is required.",
        },
        { status: 400 },
      );
    }

    const previewSession = buildSessionPreview(`preview-council-${Date.now()}`, topic, members, turns);

    if (!workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          session: previewSession,
        },
        { status: 202 },
      );
    }

    const sessionPersistence = await insertSupabaseRecord(
      "ai_council_sessions",
      {
        workspace_id: workspaceId,
        topic,
        members,
        status: "active",
        tone: "blue",
        context: context || null,
        updated_at: new Date().toISOString(),
      },
      { returning: true },
    );

    if (!sessionPersistence.persisted || !sessionPersistence.row) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Council payload is valid, but persistence is not configured or failed.",
          session: previewSession,
          persistence: sessionPersistence,
        },
        { status: 202 },
      );
    }

    const sessionRow = sessionPersistence.row;
    const turnPersistence = await insertSupabaseRecords(
      "ai_council_turns",
      turns.map((turn) => ({
        workspace_id: workspaceId,
        session_id: sessionRow.id,
        author: turn.author,
        stance: turn.stance,
        body: turn.body,
      })),
      { returning: true },
    );

    await insertSupabaseRecord("activity_logs", {
      workspace_id: workspaceId,
      entity_type: "ai_council_session",
      entity_id: sessionRow.id,
      action: "council.created",
      payload: {
        memberCount: members.length,
        topic,
      },
    });

    if (!turnPersistence.persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Council session saved, but turns could not be persisted.",
          session: previewSession,
          persistence: {
            session: sessionPersistence,
            turns: turnPersistence,
          },
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Council session saved to Supabase.",
      session: {
        id: sessionRow.id,
        topic: sessionRow.topic,
        members,
        status: getAiCouncilStatusLabel(sessionRow.status),
        tone: sessionRow.tone || "blue",
        turns: (turnPersistence.rows || []).map((turn) => ({
          author: turn.author,
          stance: turn.stance,
          time: formatAiClock(turn.created_at),
          body: turn.body,
        })),
      },
      persistence: {
        session: sessionPersistence,
        turns: turnPersistence,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
