import { getDb } from "./mongo";
import { getRecentSearches, getSearchCount } from "./history";
import { getCatalog } from "./catalog";
import { generateText } from "./vertex";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Master switch for the AI recommendations feature (set AI_ENABLED=false to
// turn it off, e.g. on a host without Vertex AI credentials configured).
const AI_ENABLED = (process.env.AI_ENABLED ?? "true").toLowerCase() !== "false";

export function isAiEnabled(): boolean {
  return AI_ENABLED;
}

export interface RecoGroup {
  basedOn: string; // e.g. "Arijit Singh" or "Popular right now"
  chips: string[]; // 4-5 short search queries
}

interface CacheDoc {
  _id: string;
  signature: string;
  createdAt: Date;
  groups: RecoGroup[];
}

function buildPrompt(history: string[], catalogTitles: string[]): string {
  const hist = history.length ? history.slice(0, 10).join(", ") : "(none)";
  const lib = catalogTitles.length ? catalogTitles.slice(0, 8).join(", ") : "(empty)";

  return `User's recent music searches: ${hist}
User's library: ${lib}

Create personalised song recommendations grouped by reason.
- Produce 2-3 groups. Each group's "basedOn" is an artist, genre or mood from their taste
  (e.g. "Arijit Singh", "Imagine Dragons", "Romantic Hindi").
- If there is little/no history, use ONE group with basedOn "Popular right now".
- Each group has 4-5 "chips": short YouTube search queries (2-5 words each) for songs they'd enjoy next.
- Don't repeat songs already in their library.

Respond ONLY as JSON:
{"groups":[{"basedOn":"Arijit Singh","chips":["arijit singh ae dil","..."]}]}`;
}

async function generateGroups(): Promise<RecoGroup[]> {
  const [history, catalog] = await Promise.all([getRecentSearches(10), getCatalog()]);
  const prompt = buildPrompt(
    history,
    catalog.map((c) => c.title),
  );

  const raw = await generateText(prompt, { json: true });
  let parsed: { groups?: { basedOn?: string; chips?: string[] }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { groups: [] };
  }

  const groups: RecoGroup[] = [];
  for (const g of parsed.groups ?? []) {
    const basedOn = String(g.basedOn ?? "").trim();
    if (!basedOn) continue;
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const c of g.chips ?? []) {
      const q = String(c).trim();
      if (q && !seen.has(q.toLowerCase())) {
        seen.add(q.toLowerCase());
        chips.push(q);
      }
      if (chips.length >= 5) break;
    }
    if (chips.length) groups.push({ basedOn, chips });
    if (groups.length >= 3) break;
  }
  return groups;
}

/** Grouped recommendations, cached unless taste changed or stale. */
export async function getRecommendationGroups(force = false): Promise<RecoGroup[]> {
  if (!AI_ENABLED) return [];
  const db = await getDb();
  const col = db.collection<CacheDoc>("recommendations");

  const [searchCount, catalog] = await Promise.all([getSearchCount(), getCatalog()]);
  const signature = `${searchCount}:${catalog.length}`;

  if (!force) {
    const cached = await col.findOne({ _id: "groups" });
    if (
      cached &&
      cached.signature === signature &&
      Date.now() - new Date(cached.createdAt).getTime() < CACHE_TTL_MS &&
      cached.groups.length > 0
    ) {
      return cached.groups;
    }
  }

  const groups = await generateGroups();
  await col.updateOne(
    { _id: "groups" },
    { $set: { signature, createdAt: new Date(), groups } },
    { upsert: true },
  );
  return groups;
}
