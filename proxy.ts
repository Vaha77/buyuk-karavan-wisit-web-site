import { createHash } from "node:crypto";
import { Pool } from "pg";
import { NextResponse, type NextRequest } from "next/server";
import { isSellerPathAllowed } from "@/lib/auth/seller-access";

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
        'SELECT u.role::text AS role FROM "AdminSession" s JOIN "AdminUser" u ON u.id = s."userId" WHERE s."tokenHash" = $1 AND s."expiresAt" > now() AND u."isActive" = true AND u."approvalStatus" = \'APPROVED\' LIMIT 1',
        [tokenHash],
      );
      return result.rowCount === 1 ? (result.rows[0].role as string) : null;
    } catch (error) {
      console.error("Admin session database query failed", { attempt, ...safeDatabaseError(error) });
      if (attempt === 2) throw error;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login" || request.nextUrl.pathname === "/admin/register") return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let role: string | null = null;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      role = await hasValidSession(tokenHash);
    } catch {
      // Fail closed: a session is never accepted when its database check cannot complete.
      role = null;
    }
  }
  // Sellers only see their own section; everything else in /admin is 403 (pages re-check the role too).
  if (role === "SELLER" && !isSellerPathAllowed(request.nextUrl.pathname)) return new NextResponse("403 — Ruxsat yo‘q", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (role) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  if (token) response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}

export const config = { matcher: "/admin/:path*" };
