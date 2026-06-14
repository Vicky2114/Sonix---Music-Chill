import { promises as fs } from "node:fs";
import path from "node:path";
import { getDb } from "./mongo";

export type MediaKind = "audio" | "video";

export interface CatalogEntry {
  id: string; // youtube video id
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string;
  kind: MediaKind; // "audio" (mp3) or "video" (mp4)
  audioUrl: string; // cloudinary url (mp3 or mp4)
  publicId: string;
  bytes: number;
  addedAt: string; // ISO date
  lastPlayedAt?: string; // ISO date
}

// Stored in Mongo with _id = youtube video id.
interface CatalogDoc extends Omit<CatalogEntry, "id"> {
  _id: string;
}

function toEntry(d: CatalogDoc): CatalogEntry {
  const { _id, ...rest } = d;
  return { id: _id, ...rest, kind: rest.kind ?? "audio" };
}

async function collection() {
  const db = await getDb();
  return db.collection<CatalogDoc>("catalog");
}

// One-time import of the old data/catalog.json into Mongo (if any).
let migrated = false;
async function migrateOnce(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const col = await collection();
    if ((await col.countDocuments()) > 0) return;
    const file = path.join(process.cwd(), "data", "catalog.json");
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (!raw) return;
    const arr = JSON.parse(raw) as CatalogEntry[];
    if (Array.isArray(arr) && arr.length) {
      const docs: CatalogDoc[] = arr.map((e) => ({
        _id: e.id,
        title: e.title,
        channel: e.channel,
        duration: e.duration,
        thumbnail: e.thumbnail,
        kind: e.kind ?? "audio",
        audioUrl: e.audioUrl,
        publicId: e.publicId,
        bytes: e.bytes,
        addedAt: e.addedAt,
      }));
      await col.insertMany(docs, { ordered: false }).catch(() => {});
    }
  } catch {
    /* ignore migration errors */
  }
}

export async function getCatalog(): Promise<CatalogEntry[]> {
  await migrateOnce();
  const col = await collection();
  const docs = await col.find({}).sort({ addedAt: -1 }).toArray();
  return docs.map(toEntry);
}

export async function addToCatalog(entry: CatalogEntry): Promise<void> {
  const col = await collection();
  const { id, ...rest } = entry;
  await col.updateOne({ _id: id }, { $set: rest }, { upsert: true });
}

export async function removeFromCatalog(id: string): Promise<void> {
  const col = await collection();
  await col.deleteOne({ _id: id });
}

export async function isInCatalog(id: string): Promise<boolean> {
  const col = await collection();
  return (await col.countDocuments({ _id: id }, { limit: 1 })) > 0;
}

/** Record that a track was played (for the "Recently played" row). */
export async function markPlayed(id: string): Promise<void> {
  const col = await collection();
  await col.updateOne({ _id: id }, { $set: { lastPlayedAt: new Date().toISOString() } });
}

/** Catalog entries that have been played, most recent first. */
export async function getRecentlyPlayed(limit = 8): Promise<CatalogEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ lastPlayedAt: { $exists: true } })
    .sort({ lastPlayedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toEntry);
}
