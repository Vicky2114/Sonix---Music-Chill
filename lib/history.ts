import { getDb } from "./mongo";

export interface SearchEvent {
  query: string;
  createdAt: Date;
}

/** Record a search query in the history collection. */
export async function addSearch(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const db = await getDb();
  await db.collection<SearchEvent>("search_history").insertOne({
    query: q,
    createdAt: new Date(),
  });
}

/** Most recent distinct search queries (newest first). */
export async function getRecentSearches(limit = 30): Promise<string[]> {
  const db = await getDb();
  const docs = await db
    .collection<SearchEvent>("search_history")
    .find({}, { projection: { query: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of docs) {
    const key = d.query.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d.query);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Total number of search events (used to detect when to refresh recos). */
export async function getSearchCount(): Promise<number> {
  const db = await getDb();
  return db.collection("search_history").countDocuments();
}

export interface HistoryItem {
  query: string;
  lastSearched: string; // ISO date
  count: number;
}

/** Distinct searches with their latest time + how many times searched. */
export async function getHistory(limit = 60): Promise<HistoryItem[]> {
  const db = await getDb();
  const docs = await db
    .collection<SearchEvent>("search_history")
    .aggregate<{ _id: string; lastSearched: Date; count: number }>([
      {
        $group: {
          _id: { $toLower: "$query" },
          query: { $last: "$query" },
          lastSearched: { $max: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastSearched: -1 } },
      { $limit: limit },
      { $project: { query: 1, lastSearched: 1, count: 1 } },
    ])
    .toArray();
  return docs.map((d) => ({
    query: (d as unknown as { query: string }).query,
    lastSearched: new Date(d.lastSearched).toISOString(),
    count: d.count,
  }));
}

/** Clear all search history (or just one query if provided). */
export async function clearHistory(query?: string): Promise<void> {
  const db = await getDb();
  if (query) {
    await db.collection("search_history").deleteMany({ query });
  } else {
    await db.collection("search_history").deleteMany({});
  }
}
