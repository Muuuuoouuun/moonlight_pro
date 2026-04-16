import { NextResponse } from "next/server";

// POST /api/content/queue — intake a studio draft into the content pipeline.
// In preview-safe mode (no Supabase), just acknowledge with a mock ID so
// the studio handoff button feels responsive. When the DB is live, this
// inserts into `content_items`.
export async function POST(request) {
  try {
    const body = await request.json();
    // Validate minimum shape
    if (!body.slides || !Array.isArray(body.slides) || body.slides.length === 0) {
      return NextResponse.json({ error: "slides array is required" }, { status: 400 });
    }

    // TODO: when Supabase is available, insert into content_items table
    // For now, return a mock acknowledgement
    const mockId = `cq_${Date.now().toString(36)}`;
    return NextResponse.json({
      ok: true,
      id: mockId,
      message: "Draft accepted into the content queue.",
      slideCount: body.slides.length,
      brand: body.brand || "all",
      channel: body.channel || "unknown",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
