"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "../types";

// setSinkId isn't in the default TS lib types yet.
type MediaWithSink = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

const SINK_KEY = "sonix.sinkId";

/** Pick the best default output: a connected headphone/headset over speakers. */
function pickPreferred(devices: MediaDeviceInfo[]): string {
  const byLabel = (re: RegExp) =>
    devices.find((d) => re.test(d.label) && !/monitor|hdmi|display|nvidia/i.test(d.label));
  const headphone = byLabel(/head(phone|set)|airdopes|earbud|buds/i);
  if (headphone) return headphone.deviceId;
  const speaker = byLabel(/speaker|realtek/i);
  if (speaker) return speaker.deviceId;
  return devices[0]?.deviceId ?? "";
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Player({
  track,
  queue,
  onChange,
  onSearchMore,
}: {
  track: CatalogEntry | null;
  queue: CatalogEntry[];
  onChange: (t: CatalogEntry | null) => void;
  onSearchMore?: () => void;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [volume, setVolume] = useState(1);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen the whole custom player (video + our controls) — NOT the bare
  // <video>, so the browser's native video controls never appear.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    setExpanded(true);
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Keep state in sync when the user exits fullscreen with Esc.
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Route audio to a chosen output device (browsers default to monitor/HDMI
  // which often has no speakers — this lets you force headphone/speaker).
  const applySink = useCallback(async (id: string) => {
    setSinkId(id);
    try {
      localStorage.setItem(SINK_KEY, id);
    } catch {}
    const media = mediaRef.current as MediaWithSink | null;
    if (media?.setSinkId && id) {
      await media.setSinkId(id).catch(() => {});
    }
  }, []);

  // Enumerate output devices (request mic permission once to reveal labels).
  const loadDevices = useCallback(async () => {
    try {
      let list = await navigator.mediaDevices.enumerateDevices();
      let outs = list.filter((d) => d.kind === "audiooutput");
      if (outs.length > 0 && !outs[0].label) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
          outs = list.filter((d) => d.kind === "audiooutput");
        } catch {}
      }
      setDevices(outs);
      const saved = localStorage.getItem(SINK_KEY);
      const chosen =
        saved && outs.some((d) => d.deviceId === saved) ? saved : pickPreferred(outs);
      if (chosen) applySink(chosen);
    } catch {}
  }, [applySink]);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, [loadDevices]);

  useEffect(() => {
    setShowEnd(false);
    const media = mediaRef.current as MediaWithSink | null;
    if (!media || !track) return;
    media.muted = false;
    media.volume = volume;
    if (sinkId && media.setSinkId) media.setSinkId(sinkId).catch(() => {});
    media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  if (!track) return null;

  const isVideo = track.kind === "video";
  const idx = queue.findIndex((t) => t.id === track.id);
  const atEnd = idx >= 0 && idx >= queue.length - 1;
  const goto = (delta: number) => {
    if (idx < 0) return;
    const next = queue[idx + delta];
    if (next) {
      onChange(next);
    } else if (delta > 0) {
      // No more songs after this one → invite the user to search for more.
      setShowEnd(true);
    }
  };

  const toggle = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      media.play();
      setPlaying(true);
    } else {
      media.pause();
      setPlaying(false);
    }
  };

  // Shared media element event wiring (works for both <audio> and <video>).
  const mediaEvents = {
    onTimeUpdate: (e: { currentTarget: HTMLMediaElement }) =>
      setCurrent(e.currentTarget.currentTime),
    onLoadedMetadata: (e: { currentTarget: HTMLMediaElement }) =>
      setTotal(e.currentTarget.duration),
    onEnded: () => goto(1),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
  };

  return (
    <div
      ref={containerRef}
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 backdrop-blur-sm"
          : "fixed bottom-0 left-0 right-0 z-50"
      }
      onClick={
        expanded && !document.fullscreenElement
          ? () => setExpanded(false)
          : undefined
      }
    >
      <div
        className={
          expanded
            ? "flex w-full max-w-[1600px] flex-col items-center gap-3"
            : "mx-auto mb-3 w-full max-w-5xl px-3 sm:px-3 lg:px-0"
        }
      >
        {/* Video panel — only for video tracks. Small corner panel by default,
            large centered "theater" view when expanded. */}
        {isVideo && (
          <div
            className={
              expanded
                ? "relative w-full"
                : "glass relative mb-2 ml-auto w-full max-w-[360px] overflow-hidden rounded-2xl shadow-2xl"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full">
              <video
                ref={(el) => {
                  mediaRef.current = el;
                }}
                src={track.audioUrl}
                poster={track.thumbnail}
                playsInline
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                className={
                  expanded
                    ? "max-h-[82vh] w-full rounded-xl bg-black object-contain"
                    : "aspect-video w-full bg-black"
                }
                {...mediaEvents}
              />
              {/* overlay controls top-right of the video */}
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  onClick={toggleFullscreen}
                  className="rounded-lg bg-black/60 px-2 py-1 text-sm text-white/90 hover:bg-black/80"
                  title="Fullscreen"
                  aria-label="Fullscreen"
                >
                  ⛶
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="rounded-lg bg-black/60 px-2 py-1 text-sm text-white/90 hover:bg-black/80"
                  title={expanded ? "Minimize" : "Expand to large view"}
                  aria-label={expanded ? "Minimize" : "Expand"}
                >
                  {expanded ? "🗗" : "⤢"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showEnd && (
          <div
            className={`glass pop-in mb-2 flex items-center gap-4 rounded-2xl px-4 py-3 shadow-2xl ${
              expanded ? "w-full" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="float-bob text-3xl">🎶</div>
            <div className="min-w-0 flex-1">
              <p className="shimmer-text text-sm font-bold">
                That&apos;s the end of your catalog!
              </p>
              <p className="text-xs text-white/50">
                Search YouTube to add more songs to your collection.
              </p>
            </div>
            <button
              onClick={() => {
                setShowEnd(false);
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                setExpanded(false);
                onSearchMore?.();
              }}
              className="flex-shrink-0 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.04]"
            >
              🔍 Search for more
            </button>
            <button
              onClick={() => setShowEnd(false)}
              className="flex-shrink-0 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/80"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className={`glass flex items-center gap-4 rounded-2xl px-4 py-3 shadow-2xl ${
            expanded ? "w-full" : ""
          }`}
          onClick={expanded ? (e) => e.stopPropagation() : undefined}
        >
          {!isVideo && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={track.thumbnail}
                alt=""
                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
              />
            </>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {isVideo ? "🎬 " : ""}
              {track.title}
            </p>
            <p className="truncate text-xs text-white/50">{track.channel}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-9 text-[10px] tabular-nums text-white/40">{fmt(current)}</span>
              <input
                type="range"
                min={0}
                max={total || 0}
                value={current}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (mediaRef.current) mediaRef.current.currentTime = v;
                  setCurrent(v);
                }}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-pink-500"
              />
              <span className="w-9 text-[10px] tabular-nums text-white/40">{fmt(total)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goto(-1)}
              disabled={idx <= 0}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 disabled:opacity-30"
              aria-label="Previous"
            >
              ⏮
            </button>
            <button
              onClick={toggle}
              className="rounded-full bg-gradient-to-br from-pink-500 to-violet-500 p-3 text-lg leading-none text-white shadow-lg transition hover:scale-105"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <button
              onClick={() => goto(1)}
              disabled={idx < 0}
              className={`rounded-full p-2 hover:bg-white/10 disabled:opacity-30 ${
                atEnd ? "text-pink-300" : "text-white/70"
              }`}
              aria-label="Next"
              title={atEnd ? "End of catalog — search for more" : "Next"}
            >
              ⏭
            </button>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="text-white/40">{volume === 0 ? "🔇" : "🔊"}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (mediaRef.current) {
                  mediaRef.current.volume = v;
                  mediaRef.current.muted = false;
                }
              }}
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-pink-500"
              aria-label="Volume"
            />
          </div>

          {devices.length > 0 && (
            <div className="hidden items-center gap-1 md:flex" title="Output device">
              <span className="text-white/40">🎧</span>
              <select
                value={sinkId}
                onChange={(e) => applySink(e.target.value)}
                className="max-w-[150px] truncate rounded-lg bg-white/10 px-2 py-1.5 text-xs text-white/80 outline-none hover:bg-white/15"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900">
                    {d.label || "Audio output"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => onChange(null)}
            className="ml-1 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/80"
            aria-label="Close player"
          >
            ✕
          </button>

          {/* Audio element — only for audio tracks (video uses the panel above) */}
          {!isVideo && (
            <audio
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={track.audioUrl}
              {...mediaEvents}
            />
          )}
        </div>
      </div>
    </div>
  );
}
