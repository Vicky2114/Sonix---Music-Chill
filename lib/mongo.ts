import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "sonix";

// Reuse the client across hot-reloads / requests (Next.js dev re-imports modules).
let clientPromise: Promise<MongoClient> | undefined;

declare global {
  // eslint-disable-next-line no-var
  var _sonixMongo: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    if (!global._sonixMongo) {
      global._sonixMongo = new MongoClient(uri).connect();
    }
    return global._sonixMongo;
  }
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbName);
}
