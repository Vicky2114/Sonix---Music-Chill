import { NextRequest, NextResponse } from "next/server";
import { getHistory, clearHistory } from "@/lib/history";

export const runtime = "nodejs";

export async function GET() {
  try {
    const history = await getHistory(60);
    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() || undefined;
  try {
    await clearHistory(query);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clear history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
