import { createHash } from "node:crypto";
import { Pool } from "pg";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "bk_admin_session";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let valid = false;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      'SELECT 1 FROM "AdminSession" s JOIN "AdminUser" u ON u.id = s."userId" WHERE s."tokenHash" = $1 AND s."expiresAt" > now() AND u."isActive" = true LIMIT 1',
      [tokenHash],
    );
    valid = result.rowCount === 1;
  }
  if (valid) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  if (token) response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}

export const config = { matcher: "/admin/:path*" };
