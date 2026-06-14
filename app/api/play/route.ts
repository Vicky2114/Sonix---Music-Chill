import { NextRequest, NextResponse } from "next/server";
import { markPlayed } from "@/lib/catalog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await markPlayed(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark played";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
