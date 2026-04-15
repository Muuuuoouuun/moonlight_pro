import { NextResponse } from "next/server";

import {
  buildAiChatReplies,
  buildAiPreview,
  buildAiThreadTitle,
  formatAiClock,
  getAiTargetLabel,
  normalizeAiAuthor,
  normalizeAiTarget,
} from "@/lib/ai-console";
import {
  insertSupabaseRecord,
  insertSupabaseRecords,
  resolveDefaultWorkspaceId,
  updateSupabaseRecord,
} from "@/lib/server-write";

export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function isPersistableThreadId(value) {
  const normalized = normalizeString(value);
  return (
    normalized &&
    !normalized.startsWith("local-") &&
    !normalized.startsWith("preview-") &&
    UUID_PATTERN.test(normalized)
  );
}

function buildThreadPreview({ id, title, target, preview, status }) {
  return {
    id,
    title,
    target: getAiTargetLabel(target),
    updated: "방금",
    preview,
    unread: 0,
    status,
  };
}

function buildMessagePreview(message, index = 0) {
  const author = normalizeAiAuthor(message.author);
  return {
    id: message.id || `preview-message-${Date.now()}-${index}`,
    author,
    authorLabel: message.authorLabel || (author === "operator" ? "You" : message.author || "System"),
    time: message.time || formatAiClock(),
    body: normalizeString(message.body),
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const workspaceId = normalizeString(payload.workspaceId) || resolveDefaultWorkspaceId();
    const body = normalizeString(payload.body);
    const target = normalizeAiTarget(payload.target);
    const existingThreadId = isPersistableThreadId(payload.threadId) ? payload.threadId : "";
    const title =
      normalizeString(payload.title) ||
      buildAiThreadTitle(body, existingThreadId ? "기존 스레드" : "새 스레드");
    const preview = buildAiPreview(body);
    const timeLabel = formatAiClock();
    const replyBundle = buildAiChatReplies({ body, target, timeLabel });

    if (!body) {
      return NextResponse.json(
        {
          status: "error",
          error: "Message body is required.",
        },
        { status: 400 },
      );
    }

    const previewThreadId = existingThreadId || `preview-thread-${Date.now()}`;
    const previewThread = buildThreadPreview({
      id: previewThreadId,
      title,
      target,
      preview,
      status: existingThreadId ? "active" : "draft",
    });
    const previewMessages = [
      buildMessagePreview(
        {
          id: `preview-operator-${Date.now()}`,
          author: "operator",
          authorLabel: "You",
          time: timeLabel,
          body,
        },
        0,
      ),
      ...replyBundle.map((item, index) =>
        buildMessagePreview(
          {
            id: `preview-reply-${Date.now()}-${index}`,
            ...item,
          },
          index + 1,
        ),
      ),
    ];

    if (!workspaceId) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Workspace ID is not configured yet. Preview only.",
          thread: previewThread,
          messages: previewMessages,
        },
        { status: 202 },
      );
    }

    let threadPersistence;

    if (existingThreadId) {
      threadPersistence = await updateSupabaseRecord(
        "ai_threads",
        [["id", `eq.${existingThreadId}`]],
        {
          title,
          target,
          status: "active",
          preview,
          unread: 0,
          updated_at: new Date().toISOString(),
        },
        { returning: true },
      );
    } else {
      threadPersistence = await insertSupabaseRecord(
        "ai_threads",
        {
          workspace_id: workspaceId,
          title,
          target,
          status: "active",
          preview,
          unread: 0,
          updated_at: new Date().toISOString(),
        },
        { returning: true },
      );
    }

    if (!threadPersistence.persisted || !threadPersistence.row) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Chat payload is valid, but persistence is not configured or failed.",
          thread: previewThread,
          messages: previewMessages,
          persistence: threadPersistence,
        },
        { status: 202 },
      );
    }

    const threadRow = threadPersistence.row;
    const messageRecords = [
      {
        workspace_id: workspaceId,
        thread_id: threadRow.id,
        author: "operator",
        author_label: "You",
        body,
      },
      ...replyBundle.map((item) => ({
        workspace_id: workspaceId,
        thread_id: threadRow.id,
        author: normalizeAiAuthor(item.author),
        author_label: item.authorLabel,
        body: item.body,
      })),
    ];

    const messagePersistence = await insertSupabaseRecords("ai_messages", messageRecords, {
      returning: true,
    });

    await insertSupabaseRecord("activity_logs", {
      workspace_id: workspaceId,
      entity_type: "ai_thread",
      entity_id: threadRow.id,
      action: existingThreadId ? "chat.message.appended" : "chat.thread.created",
      payload: {
        target,
        preview,
        messageCount: messageRecords.length,
      },
    });

    if (!messagePersistence.persisted) {
      return NextResponse.json(
        {
          status: "preview",
          message: "Thread saved, but message persistence failed. Preview payload returned.",
          thread: buildThreadPreview({
            id: threadRow.id,
            title: threadRow.title,
            target: threadRow.target,
            preview: threadRow.preview,
            status: threadRow.status,
          }),
          messages: previewMessages,
          persistence: {
            thread: threadPersistence,
            messages: messagePersistence,
          },
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      status: "saved",
      message: "Chat thread saved to Supabase.",
      thread: buildThreadPreview({
        id: threadRow.id,
        title: threadRow.title,
        target: threadRow.target,
        preview: threadRow.preview,
        status: threadRow.status,
      }),
      messages: (messagePersistence.rows || []).map((item, index) =>
        buildMessagePreview(
          {
            id: item.id,
            author: item.author,
            authorLabel: item.author_label,
            time: formatAiClock(item.created_at),
            body: item.body,
          },
          index,
        ),
      ),
      persistence: {
        thread: threadPersistence,
        messages: messagePersistence,
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
