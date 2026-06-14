"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatalogEntry,
  HistoryItem,
  MediaKind,
  RecoGroup,
  SearchResult,
} from "./types";
import Player from "./components/Player";

type Tab = "search" | "catalog" | "history";

export default function Home() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("search");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<Map<string, MediaKind>>(new Map());
  const [listening, setListening] = useState(false);
  const [track, setTrack] = useState<CatalogEntry | null>(null);
  const [recoGroups, setRecoGroups] = useState<RecoGroup[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [recentlyPlayed, setRecentlyPlayed] = useState<CatalogEntry[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const recognitionRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Called from the player when the user reaches the end of the catalog.
  const searchMore = useCallback(() => {
    setTab("search");
    setTrack(null);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, []);

  // ---- Catalog ----
  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      if (res.ok) {
        setCatalog(data.catalog);
        setRecentlyPlayed(data.recentlyPlayed || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // ---- Play a catalog track (records "recently played") ----
  const playTrack = useCallback((entry: CatalogEntry) => {
    setTrack(entry);
    setRecentlyPlayed((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 8));
    fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    }).catch(() => {});
  }, []);

  // ---- Search history view ----
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (res.ok) setHistory(data.history || []);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const clearAllHistory = useCallback(async () => {
    await fetch("/api/history", { method: "DELETE" }).catch(() => {});
    setHistory([]);
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  const catalogIds = new Set(catalog.map((c) => c.id));

  // ---- Search ----
  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setError("");
    setTab("search");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results);
      if (data.results.length === 0) setError("No results found.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // ---- Voice search (Web Speech API) ----
  const startVoice = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice search isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      setQuery(transcript);
      runSearch(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [runSearch]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // ---- Download → Cloudinary ----
  const download = useCallback(async (r: SearchResult, kind: MediaKind) => {
    setDownloading((s) => new Map(s).set(r.id, kind));
    setError("");
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, thumbnail: r.thumbnail, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      setCatalog((c) => [data.entry, ...c.filter((e) => e.id !== r.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading((s) => {
        const next = new Map(s);
        next.delete(r.id);
        return next;
      });
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError("");
      try {
        const res = await fetch(`/api/catalog?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to delete from Cloudinary");
          return; // keep the card so the user can retry
        }
        // Only remove locally once Cloudinary confirmed deletion
        setCatalog((c) => c.filter((e) => e.id !== id));
        if (track?.id === id) setTrack(null);
      } catch {
        setError("Couldn't reach the server to delete this song.");
      }
    },
    [track],
  );

  // ---- AI recommendations ----
  const loadRecommendations = useCallback(async (force = false) => {
    setRecoLoading(true);
    setRecoError("");
    try {
      const res = await fetch(`/api/recommendations${force ? "?force=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load recommendations");
      setRecoGroups(data.groups || []);
      setAiEnabled(data.aiEnabled !== false);
    } catch (e) {
      setRecoError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setRecoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations(false);
  }, [loadRecommendations]);

  // Reusable card for both search results and recommendations
  const renderCard = (r: SearchResult, reason?: string) => {
    const inCatalog = catalogIds.has(r.id);
    const dlKind = downloading.get(r.id);
    return (
      <div
        key={r.id}
        className="group glass overflow-hidden rounded-2xl transition hover:border-white/20"
      >
        <div className="relative aspect-video overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.thumbnail}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
          {r.durationText && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium">
              {r.durationText}
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{r.title}</p>
          <p className="mt-1 truncate text-xs text-white/45">{r.channel}</p>
          {reason && (
            <p className="mt-1 line-clamp-1 text-[11px] text-pink-300/80">✨ {reason}</p>
          )}
          {inCatalog ? (
            <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-300">
              ✓ In catalog
            </div>
          ) : dlKind ? (
            <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
              <span className="spin inline-block">◌</span> Saving{" "}
              {dlKind === "video" ? "video" : "audio"}…
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => download(r, "audio")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-2 py-2 text-sm font-semibold transition hover:bg-white/20"
              >
                🎵 Audio
              </button>
              <button
                onClick={() => download(r, "video")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-2 py-2 text-sm font-semibold transition hover:bg-white/20"
              >
                🎬 Video
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-8 sm:px-6">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-violet-500 text-xl shadow-lg">
            🎵
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sonix</h1>
            <p className="text-xs text-white/45">YouTube → Audio → Your Catalog</p>
          </div>
        </div>
        <div className="glass flex rounded-full p-1 text-sm">
          <button
            onClick={() => setTab("search")}
            className={`rounded-full px-4 py-1.5 transition ${
              tab === "search" ? "bg-white/15 font-semibold" : "text-white/60"
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setTab("catalog")}
            className={`rounded-full px-4 py-1.5 transition ${
              tab === "catalog" ? "bg-white/15 font-semibold" : "text-white/60"
            }`}
          >
            Catalog{catalog.length ? ` · ${catalog.length}` : ""}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`rounded-full px-4 py-1.5 transition ${
              tab === "history" ? "bg-white/15 font-semibold" : "text-white/60"
            }`}
          >
            History
          </button>
        </div>
      </header>

      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="glass mb-6 flex items-center gap-2 rounded-2xl p-2 shadow-xl"
      >
        <span className="pl-2 text-white/40">🔎</span>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a song, artist, or lyrics…"
          className="flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-white/35"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setError("");
              searchInputRef.current?.focus();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
            aria-label="Clear search"
            title="Clear"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition ${
            listening
              ? "mic-listening bg-pink-500 text-white"
              : "bg-white/10 text-white/70 hover:bg-white/20"
          }`}
          aria-label="Voice search"
          title="Voice search"
        >
          🎤
        </button>
        <button
          type="submit"
          disabled={searching}
          className="rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 px-5 py-2.5 font-semibold text-white shadow-lg transition hover:scale-[1.03] disabled:opacity-60"
        >
          {searching ? "…" : "Search"}
        </button>
      </form>

      {listening && (
        <p className="mb-4 text-center text-sm text-pink-300">🎙 Listening… speak now</p>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* SEARCH TAB */}
      {tab === "search" && (
        <section>
          {searching && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="glass h-56 animate-pulse rounded-2xl" />
              ))}
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((r) => renderCard(r))}
            </div>
          )}

          {/* Home view: recommendations + recently played when not searching */}
          {!searching && results.length === 0 && (
            <div className="space-y-8">
              {aiEnabled && (
              <div>
                <div className="mb-4 mt-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      <span className="shimmer-text">✨ Recommended for you</span>
                    </h2>
                    <p className="text-xs text-white/45">
                      Powered by Gemini · tap a chip to search
                    </p>
                  </div>
                  <button
                    onClick={() => loadRecommendations(true)}
                    disabled={recoLoading}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-50"
                  >
                    {recoLoading ? "…" : "↻ Refresh"}
                  </button>
                </div>

                {recoLoading && (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, g) => (
                      <div key={g}>
                        <div className="glass mb-2 h-4 w-40 animate-pulse rounded" />
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="glass h-9 animate-pulse rounded-full"
                              style={{ width: `${90 + ((i * 37) % 90)}px` }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!recoLoading && recoError && (
                  <div className="glass rounded-2xl p-6 text-center text-sm text-white/60">
                    🤔 Couldn&apos;t load suggestions — {recoError}
                  </div>
                )}

                {!recoLoading && !recoError && recoGroups.length > 0 && (
                  <div className="space-y-5">
                    {recoGroups.map((g) => (
                      <div key={g.basedOn}>
                        <p className="mb-2 text-sm font-semibold text-white/70">
                          {g.basedOn.toLowerCase().includes("popular")
                            ? "🔥 "
                            : "💗 Because you liked "}
                          <span className="text-white">{g.basedOn}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {g.chips.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                setQuery(c);
                                runSearch(c);
                              }}
                              className="glass rounded-full px-4 py-2 text-sm font-medium text-white/80 transition hover:scale-[1.04] hover:bg-white/15 hover:text-white"
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!recoLoading && !recoError && recoGroups.length === 0 && (
                  <div className="glass rounded-3xl p-10 text-center">
                    <p className="text-4xl">🎧</p>
                    <p className="mt-3 text-base font-semibold">Find your next song</p>
                    <p className="mt-1 text-sm text-white/45">
                      Search a few songs and your AI picks will appear here.
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* Recently played */}
              {recentlyPlayed.length > 0 && (
                <div>
                  <h2 className="mb-4 text-lg font-bold">🕑 Recently played</h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {recentlyPlayed.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => playTrack(c)}
                        className="group glass overflow-hidden rounded-2xl text-left transition hover:border-white/20"
                      >
                        <div className="relative aspect-video overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.thumbnail}
                            alt=""
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold">
                            {c.kind === "video" ? "🎬" : "🎵"}
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-500 text-lg shadow-lg">
                              ▶
                            </span>
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug">
                            {c.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-white/45">{c.channel}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!aiEnabled && recentlyPlayed.length === 0 && (
                <div className="glass rounded-3xl p-12 text-center">
                  <p className="text-5xl">🎧</p>
                  <p className="mt-4 text-lg font-semibold">Find your next song</p>
                  <p className="mt-1 text-sm text-white/45">
                    Search a song above or tap the mic.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* CATALOG TAB */}
      {tab === "catalog" && (
        <section>
          {catalog.length === 0 ? (
            <div className="glass mt-10 rounded-3xl p-12 text-center">
              <p className="text-5xl">📀</p>
              <p className="mt-4 text-lg font-semibold">Your catalog is empty</p>
              <p className="mt-1 text-sm text-white/45">
                Download songs from the Search tab to build your collection.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {catalog.map((c) => (
                <div
                  key={c.id}
                  className={`group glass overflow-hidden rounded-2xl transition hover:border-white/20 ${
                    track?.id === c.id ? "ring-2 ring-pink-500" : ""
                  }`}
                >
                  <div className="relative aspect-video overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold">
                      {c.kind === "video" ? "🎬 Video" : "🎵 Audio"}
                    </span>
                    <button
                      onClick={() => playTrack(c)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-500 text-xl shadow-lg">
                        ▶
                      </span>
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">
                      {c.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/45">{c.channel}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => playTrack(c)}
                        className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                      >
                        ▶ Play
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/50 hover:bg-red-500/20 hover:text-red-300"
                        aria-label="Remove"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">🕘 Search history</h2>
              <p className="text-xs text-white/45">Tap to search again · stored in MongoDB</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearAllHistory}
                className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/60 transition hover:bg-red-500/20 hover:text-red-300"
              >
                🗑 Clear all
              </button>
            )}
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass h-12 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="glass mt-10 rounded-3xl p-12 text-center">
              <p className="text-5xl">🕘</p>
              <p className="mt-4 text-lg font-semibold">No search history yet</p>
              <p className="mt-1 text-sm text-white/45">
                Songs you search for will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.query}
                  className="glass flex items-center gap-3 rounded-xl px-4 py-3 transition hover:border-white/20"
                >
                  <span className="text-white/40">🔎</span>
                  <button
                    onClick={() => {
                      setQuery(h.query);
                      runSearch(h.query);
                    }}
                    className="flex-1 truncate text-left text-sm font-medium hover:text-pink-300"
                  >
                    {h.query}
                  </button>
                  {h.count > 1 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                      ×{h.count}
                    </span>
                  )}
                  <span className="text-[11px] text-white/35">
                    {new Date(h.lastSearched).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Player
        track={track}
        queue={catalog}
        onChange={(t) => (t ? playTrack(t) : setTrack(null))}
        onSearchMore={searchMore}
      />
    </main>
  );
}
