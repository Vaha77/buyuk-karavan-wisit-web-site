import { createHash } from "node:crypto";
import { Pool } from "pg";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "bk_admin_session";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
  allowExitOnIdle: true,
});

type SafeDatabaseError = { name: string; code: string | null; errno: string | null; syscall: string | null; address: string | null; port: number | null; causes: SafeDatabaseError[] };

function safeDatabaseError(error: unknown): SafeDatabaseError {
  const item = error as { name?: string; code?: string; errno?: string; syscall?: string; address?: string; port?: number; errors?: unknown[] };
  return {
    name: item?.name ?? "UnknownError",
    code: item?.code ?? null,
    errno: item?.errno ?? null,
    syscall: item?.syscall ?? null,
    address: item?.address ?? null,
    port: item?.port ?? null,
    causes: Array.isArray(item?.errors) ? item.errors.map(safeDatabaseError) : [],
  };
}

async function hasValidSession(tokenHash: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await pool.query(
        'SELECT 1 FROM "AdminSession" s JOIN "AdminUser" u ON u.id = s."userId" WHERE s."tokenHash" = $1 AND s."expiresAt" > now() AND u."isActive" = true AND u."approvalStatus" = \'APPROVED\' LIMIT 1',
        [tokenHash],
      );
      return result.rowCount === 1;
    } catch (error) {
      console.error("Admin session database query failed", { attempt, ...safeDatabaseError(error) });
      if (attempt === 2) throw error;
    }
  }
  return false;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login" || request.nextUrl.pathname === "/admin/register") return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let valid = false;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      valid = await hasValidSession(tokenHash);
    } catch {
      // Fail closed: a session is never accepted when its database check cannot complete.
      valid = false;
    }
  }
  if (valid) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  if (token) response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}

export const config = { matcher: "/admin/:path*" };
