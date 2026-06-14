import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * yt-dlp is invoked through the Python module (`python -m yt_dlp`) so we don't
 * depend on a yt-dlp.exe being on PATH. ffmpeg location comes from env.
 */
const PYTHON = process.env.PYTHON_PATH || "python";
const FFMPEG_LOCATION = process.env.FFMPEG_LOCATION || "";

export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  durationText: string;
  thumbnail: string;
  url: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function run(args: string[], timeoutMs = 120000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ["-m", "yt_dlp", ...args], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("yt-dlp timed out"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
  });
}

/** Search YouTube using yt-dlp's ytsearch feature. No API key needed. */
export async function searchYouTube(query: string, limit = 12): Promise<SearchResult[]> {
  const { stdout } = await run([
    `ytsearch${limit}:${query}`,
    "--dump-json",
    "--flat-playlist",
    "--no-warnings",
  ]);

  const results: SearchResult[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed);
      const id: string = item.id;
      if (!id) continue;
      const duration: number | null = item.duration ?? null;
      results.push({
        id,
        title: item.title ?? "Unknown title",
        channel: item.channel ?? item.uploader ?? "Unknown",
        duration,
        durationText: formatDuration(duration),
        // hqdefault is always available for any video id, no API call needed
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
      });
    } catch {
      // skip non-JSON lines
    }
  }
  return results;
}

export type MediaKind = "audio" | "video";

/**
 * Download a video's media to a temp file:
 *  - "audio" → mp3 (small, for a music library)
 *  - "video" → mp4 capped at 720p (video + audio merged)
 * Returns the file path and basic metadata. Caller deletes the temp file.
 */
export async function downloadMedia(
  videoId: string,
  kind: MediaKind = "audio",
): Promise<{
  filePath: string;
  title: string;
  channel: string;
  duration: number | null;
}> {
  const tmpDir = os.tmpdir();
  const outTemplate = path.join(tmpDir, `yt-${videoId}-%(id)s.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const args = [url, "-o", outTemplate, "--no-playlist", "--no-warnings"];

  if (kind === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    // Cap at 720p to keep file size within Cloudinary's free limits.
    args.push(
      "-f",
      "bv*[height<=720]+ba/b[height<=720]/b",
      "--merge-output-format",
      "mp4",
    );
  }

  args.push(
    "--print",
    "after_move:%(title)s\t%(channel)s\t%(duration)s\t%(filepath)s",
  );
  if (FFMPEG_LOCATION) {
    args.push("--ffmpeg-location", FFMPEG_LOCATION);
  }

  const { stdout } = await run(args, 300000);
  // The last non-empty printed line holds our tab-separated metadata
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();

  if (!line) throw new Error("Download produced no output file");
  const [title, channel, durationStr, filePath] = line.split("\t");
  const duration = durationStr && durationStr !== "NA" ? Number(durationStr) : null;

  return {
    filePath,
    title: title || "Unknown title",
    channel: channel || "Unknown",
    duration: Number.isFinite(duration as number) ? duration : null,
  };
}
