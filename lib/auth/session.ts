import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/lib/db";

export const ADMIN_COOKIE = "bk_admin_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function createAdminSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getDb().adminSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  (await cookies()).set(ADMIN_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
}

const findAdminSession = cache(async (tokenHash: string) => {
  const session = await getDb().adminSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date() || !session.user.isActive || session.user.approvalStatus!=="APPROVED") {
    await getDb().adminSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session;
});

export async function getAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return findAdminSession(hashToken(token));
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await getDb().adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.set(ADMIN_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
