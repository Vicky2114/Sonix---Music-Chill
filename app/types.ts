export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  durationText: string;
  thumbnail: string;
  url: string;
}

export interface RecoGroup {
  basedOn: string;
  chips: string[];
}

export interface HistoryItem {
  query: string;
  lastSearched: string;
  count: number;
}

export type MediaKind = "audio" | "video";

export interface CatalogEntry {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string;
  kind: MediaKind;
  audioUrl: string; // media URL (mp3 for audio, mp4 for video)
  publicId: string;
  bytes: number;
  addedAt: string;
}
