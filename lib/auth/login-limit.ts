import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function keyForPhone(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

export async function isLoginLimited(phone: string): Promise<boolean> {
  const attempt = await getDb().adminLoginAttempt.findUnique({ where: { key: keyForPhone(phone) } });
  return !!attempt && attempt.attempts >= MAX_ATTEMPTS && attempt.windowStart.getTime() > Date.now() - WINDOW_MS;
}

export async function recordLoginFailure(phone: string): Promise<void> {
  const key = keyForPhone(phone);
  await getDb().$executeRaw`
    INSERT INTO "AdminLoginAttempt" ("key", "attempts", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AdminLoginAttempt"."windowStart" < now() - interval '15 minutes' THEN 1 ELSE "AdminLoginAttempt"."attempts" + 1 END,
      "windowStart" = CASE WHEN "AdminLoginAttempt"."windowStart" < now() - interval '15 minutes' THEN now() ELSE "AdminLoginAttempt"."windowStart" END
  `;
}

export async function clearLoginFailures(phone: string): Promise<void> {
  await getDb().adminLoginAttempt.deleteMany({ where: { key: keyForPhone(phone) } });
}
