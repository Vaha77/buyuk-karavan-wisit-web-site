import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { writeAudit } from "@/lib/audit/service";
import { getAdminSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { exchangeCode, exchangeLongLived, getMe, GraphError, subscribeWebhooks } from "@/lib/instagram/graph";
import { CALLBACK_PATH, STATE_COOKIE, redirectUri, requestOrigin } from "@/lib/instagram/oauth";
import { errorReason } from "@/lib/instagram/rules";
import { encryptToken } from "@/lib/instagram/service";

export const runtime = "nodejs";

const back = (origin: string, result: string) => {
  const response = NextResponse.redirect(new URL(`/admin/settings?instagram=${encodeURIComponent(result)}#instagram`, origin), 303);
  response.cookies.set(STATE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 });
  return response;
};

/** Instagram Login → long-lived token (encrypted) + account + webhook subscription. Super Admin only; state cookie checked. */
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request.headers);
  const session = await getAdminSession();
  if (!session || session.user.role !== "SUPER_ADMIN") return back(origin, "forbidden");
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(origin, "denied");
  const state = params.get("state") ?? "", expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!state || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return back(origin, "state");
  const code = (params.get("code") ?? "").replace(/#_$/, "");
  if (!code) return back(origin, "code");
  try {
    const short = await exchangeCode(code, redirectUri(origin));
    const long = await exchangeLongLived(short.token);
    const me = await getMe(long.token);
    const tokenEncrypted = encryptToken(long.token);
    if (!tokenEncrypted) return back(origin, "key");
    let webhookSubscribedAt: Date | null = null, webhookError: string | null = null;
    try { await subscribeWebhooks(long.token); webhookSubscribedAt = new Date(); }
    catch (error) { webhookError = error instanceof GraphError ? errorReason(error.info) : "Obuna bo‘lmadi"; }
    const data = { igUserId: me.userId, username: me.username, grantedScopes: short.permissions, tokenEncrypted, tokenExpiresAt: long.expiresAt, tokenRefreshedAt: new Date(), webhookSubscribedAt, webhookError, connectedById: session.user.id };
    await getDb().instagramAccount.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
    await writeAudit(session.user, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: `Instagram @${me.username} ulandi`, after: { username: me.username, permissions: short.permissions, webhook: webhookSubscribedAt ? "ok" : webhookError } });
    return back(origin, webhookError ? "connected-no-webhook" : "connected");
  } catch (error) {
    console.error("Instagram connect failed", { type: error instanceof GraphError ? `GraphError ${error.info.code ?? error.info.status}` : error instanceof Error ? error.name : "UnknownError" });
    return back(origin, "failed");
  }
}
