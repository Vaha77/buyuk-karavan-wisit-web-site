import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const DB_SCHEMA_REVISION = "20260921113000";
const globalForDb = globalThis as unknown as { buyukKaravanDb?: PrismaClient; buyukKaravanDbRevision?: string };

/** Server-side only. The client is created on first use, not during a frontend build. */
export function getDb(): PrismaClient {
  const existing = globalForDb.buyukKaravanDb;
  if (existing) {
    const delegates = existing as PrismaClient & { project?: { findMany?: unknown }; productCategory?: { findMany?: unknown } };
    if (typeof delegates.project?.findMany === "function" && typeof delegates.productCategory?.findMany === "function" && globalForDb.buyukKaravanDbRevision === DB_SCHEMA_REVISION) return existing;

    // A dev server can retain a global client created before `prisma generate`.
    // Discard that stale runtime instance so the regenerated client is loaded.
    void existing.$disconnect();
    delete globalForDb.buyukKaravanDb;
    delete globalForDb.buyukKaravanDbRevision;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.buyukKaravanDb = db;
    globalForDb.buyukKaravanDbRevision = DB_SCHEMA_REVISION;
  }
  return db;
}
