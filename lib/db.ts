import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const DB_SCHEMA_REVISION = "20261005120000";
const globalForDb = globalThis as unknown as { buyukKaravanDb?: PrismaClient; buyukKaravanDbRevision?: string };

/** Server-side only. The client is created on first use, not during a frontend build. */
export function getDb(): PrismaClient {
  const existing = globalForDb.buyukKaravanDb;
  if (existing) {
    const delegates = existing as PrismaClient & { project?: { findMany?: unknown }; productCategory?: { findMany?: unknown }; siteSettings?: { findUnique?: unknown }; aiPriceList?: { findFirst?: unknown }; referralLink?: { findMany?: unknown }; salesPerson?: { findMany?: unknown }; customerPurchase?: { findMany?: unknown } };
    if (typeof delegates.project?.findMany === "function" && typeof delegates.productCategory?.findMany === "function" && typeof delegates.siteSettings?.findUnique === "function" && typeof delegates.aiPriceList?.findFirst === "function" && typeof delegates.referralLink?.findMany === "function" && typeof delegates.salesPerson?.findMany === "function" && typeof delegates.customerPurchase?.findMany === "function" && globalForDb.buyukKaravanDbRevision === DB_SCHEMA_REVISION) return existing;

    // A dev server can retain a global client created before `prisma generate`.
    // Discard that stale runtime instance so the regenerated client is loaded.
    void existing.$disconnect();
    delete globalForDb.buyukKaravanDb;
    delete globalForDb.buyukKaravanDbRevision;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  // Reuse one client (and its pg pool) for the lifetime of a warm Vercel runtime.
  globalForDb.buyukKaravanDb = db;
  globalForDb.buyukKaravanDbRevision = DB_SCHEMA_REVISION;
  return db;
}
