import { NextRequest, NextResponse } from "next/server";
import { getRecommendationGroups } from "@/lib/recommendations";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const groups = await getRecommendationGroups(force);
    return NextResponse.json({ groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get recommendations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
