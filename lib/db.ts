import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForDb = globalThis as unknown as { buyukKaravanDb?: PrismaClient };

/** Server-side only. The client is created on first use, not during a frontend build. */
export function getDb(): PrismaClient {
  if (globalForDb.buyukKaravanDb) return globalForDb.buyukKaravanDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForDb.buyukKaravanDb = db;
  return db;
}
