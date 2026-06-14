import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getRecentlyPlayed, removeFromCatalog } from "@/lib/catalog";
import { cloudinary } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [catalog, recentlyPlayed] = await Promise.all([
      getCatalog(),
      getRecentlyPlayed(8),
    ]);
    return NextResponse.json({ catalog, recentlyPlayed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load catalog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const catalog = await getCatalog();
    const entry = catalog.find((e) => e.id === id);

    if (entry) {
      // Delete from Cloudinary FIRST. Audio + video are both stored under the
      // "video" resource type. Only continue if it actually went away.
      const res = await cloudinary.uploader.destroy(entry.publicId, {
        resource_type: "video",
        invalidate: true,
      });
      // "ok" = deleted, "not found" = already gone — both are fine to proceed.
      if (res.result !== "ok" && res.result !== "not found") {
        return NextResponse.json(
          {
            error: `Cloudinary did not delete the file (status: ${res.result}). Catalog entry kept so you can retry.`,
          },
          { status: 502 },
        );
      }
    }

    await removeFromCatalog(id);
    return NextResponse.json({ ok: true, cloudinary: entry ? "deleted" : "no-file" });
  } catch (err) {
    // Network/auth failure talking to Cloudinary — keep the entry, report it.
    const message = err instanceof Error ? err.message : "Failed to delete";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
