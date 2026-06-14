import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { downloadMedia, type MediaKind } from "@/lib/ytdlp";
import { uploadMedia, isCloudinaryConfigured } from "@/lib/cloudinary";
import { addToCatalog } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Cloudinary is not configured. Add your keys to .env.local." },
      { status: 500 },
    );
  }

  let body: { id?: string; thumbnail?: string; kind?: MediaKind };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoId = body.id?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "Missing video id" }, { status: 400 });
  }
  const kind: MediaKind = body.kind === "video" ? "video" : "audio";

  let filePath: string | null = null;
  try {
    // 1. Download media (mp3 or mp4) to a temp file
    const dl = await downloadMedia(videoId, kind);
    filePath = dl.filePath;

    // 2. Upload to Cloudinary (separate public id per kind so both can coexist)
    const publicId = kind === "video" ? `${videoId}-video` : videoId;
    const uploaded = await uploadMedia(filePath, publicId);

    // 3. Save to local catalog
    const entry = {
      id: videoId,
      title: dl.title,
      channel: dl.channel,
      duration: dl.duration,
      thumbnail: body.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      kind,
      audioUrl: uploaded.url,
      publicId: uploaded.publicId,
      bytes: uploaded.bytes,
      addedAt: new Date().toISOString(),
    };
    await addToCatalog(entry);

    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (filePath) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}
