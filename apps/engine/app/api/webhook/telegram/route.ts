import { NextResponse } from "next/server"
import { logError, logInfo } from "@com-moon/hub-gateway"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TelegramUpdate = {
  update_id: number
  message?: { text?: string; chat?: { id: number } }
  callback_query?: { data?: string }
}

type EventType = "command" | "message" | "callback_query" | "unknown"

function detectEventType(update: TelegramUpdate): EventType {
  if (update.callback_query) return "callback_query"
  if (update.message?.text?.startsWith("/")) return "command"
  if (update.message) return "message"
  return "unknown"
}

async function storeWebhookEvent(
  update: TelegramUpdate,
  eventType: EventType
): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || url.includes("placeholder")) return

  await fetch(`${url}/rest/v1/webhook_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      source: "telegram",
      event_type: eventType,
      payload: update,
      received_at: new Date().toISOString(),
    }),
  })
}

async function forwardToN8n(update: TelegramUpdate): Promise<void> {
  const n8nUrl = process.env.N8N_WEBHOOK_URL
  if (!n8nUrl) return

  await fetch(n8nUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  })
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const update: TelegramUpdate = await req.json()
    const eventType = detectEventType(update)

    await Promise.all([
      storeWebhookEvent(update, eventType),
      forwardToN8n(update),
    ])

    await logInfo({
      context: "telegram-webhook",
      payload: { update_id: update.update_id, event_type: eventType },
      trace: "telegram-api",
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    await logError({
      context: "telegram-webhook",
      payload: { error: String(error) },
      trace: "telegram-api",
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
