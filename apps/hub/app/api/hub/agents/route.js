import { NextResponse } from "next/server";

import { getPersonas } from "@/lib/sales-os/persona-registry";
import { getQueueSummary } from "@/lib/sales-os/work-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the seeded 5-persona roster (live status) + the approval-queue summary.
export async function GET() {
  const [personas, queue] = await Promise.all([getPersonas({}), getQueueSummary({})]);

  return NextResponse.json({
    status: personas.source === "supabase" ? "live" : "preview",
    source: personas.source,
    personas: personas.personas,
    queue,
  });
}
