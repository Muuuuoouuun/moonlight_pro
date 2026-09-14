import { NextResponse } from "next/server.js";
import { getContentStudioCatalog } from "@/lib/repositories/content-studio-catalog";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await getContentStudioCatalog()); }
