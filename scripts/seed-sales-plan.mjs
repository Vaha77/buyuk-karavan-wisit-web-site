// One-time, idempotent seed for "Sotuv rejasi": period "Mart – Avgust 2026", sellers, plans and monthly results.
// Only inserts what is missing (ON CONFLICT DO NOTHING / lookup by name) — never updates or deletes existing rows,
// so running it again, or after admins edited the data, changes nothing.
//   node scripts/seed-sales-plan.mjs            (uses DATABASE_URL from .env)
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { SEED_PEOPLE, SEED_PERIOD } from "../lib/sales-plan/seed-data.ts";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const added = { period: 0, people: 0, plans: 0, months: 0 };
try {
  await client.query("BEGIN");
  const period = await client.query('INSERT INTO "SalesPeriod" ("id","name","startYear","startMonth","monthCount","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("startYear","startMonth") DO NOTHING', [randomUUID(), SEED_PERIOD.name, SEED_PERIOD.startYear, SEED_PERIOD.startMonth, SEED_PERIOD.monthCount]);
  added.period += period.rowCount;
  const { rows: [{ id: periodId }] } = await client.query('SELECT id FROM "SalesPeriod" WHERE "startYear" = $1 AND "startMonth" = $2', [SEED_PERIOD.startYear, SEED_PERIOD.startMonth]);
  for (const [index, person] of SEED_PEOPLE.entries()) {
    let { rows: [existing] } = await client.query('SELECT id FROM "SalesPerson" WHERE name = $1 ORDER BY "createdAt" LIMIT 1', [person.name]);
    if (!existing) {
      existing = { id: randomUUID() };
      await client.query('INSERT INTO "SalesPerson" ("id","name","kind","branchHead","isActive","sortOrder","createdAt","updatedAt") VALUES ($1,$2,$3,$4,true,$5,NOW(),NOW())', [existing.id, person.name, person.kind, person.branchHead, index + 1]);
      added.people++;
    }
    const plan = await client.query('INSERT INTO "SalesPlan" ("id","periodId","personId","planUsd","createdAt","updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT ("periodId","personId") DO NOTHING', [randomUUID(), periodId, existing.id, person.plan]);
    added.plans += plan.rowCount;
    for (const [offset, amount] of person.months.entries()) {
      const zeroBased = SEED_PERIOD.startMonth - 1 + offset;
      const month = await client.query('INSERT INTO "SalesMonthly" ("id","personId","year","month","amountUsd","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("personId","year","month") DO NOTHING', [randomUUID(), existing.id, SEED_PERIOD.startYear + Math.floor(zeroBased / 12), (zeroBased % 12) + 1, amount]);
      added.months += month.rowCount;
    }
  }
  await client.query("COMMIT");
  console.log(`Sotuv rejasi seed: +${added.period} davr, +${added.people} sotuvchi, +${added.plans} reja, +${added.months} oylik yozuv (mavjudlari o‘zgartirilmadi).`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
