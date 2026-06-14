import { NextRequest, NextResponse } from "next/server";
import { searchYouTube } from "@/lib/ytdlp";
import { addSearch } from "@/lib/history";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  try {
    const results = await searchYouTube(query, 12);
    // Log to history (best-effort — don't fail search if Mongo is down)
    addSearch(query).catch(() => {});
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
