import "server-only";
// Instagram API with Instagram Login (graph.instagram.com). The access token goes in the Authorization header (or, where
// Meta requires it, the query string of a request that is never logged); errors carry only status / code / message.
import { GRAPH_HOST, GRAPH_VERSION, OAUTH_TOKEN_URL, type GraphErrorInfo } from "./rules";

export class GraphError extends Error {
  constructor(public info: GraphErrorInfo) { super(`Instagram API error ${info.code ?? info.status}`); this.name = "GraphError"; }
}

export function appConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim(), appSecret = process.env.INSTAGRAM_APP_SECRET?.trim(), verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  return { appId: appId || null, appSecret: appSecret || null, verifyToken: verifyToken || null, missing: [!appId && "INSTAGRAM_APP_ID", !appSecret && "INSTAGRAM_APP_SECRET", !verifyToken && "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"].filter(Boolean) as string[] };
}

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers } });
  } catch (error) {
    throw new GraphError({ status: 0, message: error instanceof Error ? error.name : "Network error" });
  }
  const body = await response.json().catch(() => null) as { error?: { code?: number; error_subcode?: number; message?: string; error_message?: string } } & Record<string, unknown> | null;
  if (!response.ok || body?.error) {
    const error = body?.error;
    throw new GraphError({ status: response.status, code: error?.code ?? (typeof body?.code === "number" ? body.code : undefined), subcode: error?.error_subcode, message: error?.message ?? (typeof body?.error_message === "string" ? body.error_message : undefined) });
  }
  return body as T;
}

const graph = (path: string, query?: Record<string, string>) => `${GRAPH_HOST}/${GRAPH_VERSION}/${path}${query ? `?${new URLSearchParams(query)}` : ""}`;

// ---- OAuth -----------------------------------------------------------------------------------------------

/** Authorization code → short-lived token + Instagram professional account id. */
export async function exchangeCode(code: string, redirectUri: string) {
  const { appId, appSecret } = appConfig();
  if (!appId || !appSecret) throw new GraphError({ status: 0, message: "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET yo‘q" });
  const body = new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const result = await call<{ access_token?: string; user_id?: string | number; permissions?: string | string[]; data?: Array<{ access_token?: string; user_id?: string | number; permissions?: string | string[] }> }>(OAUTH_TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const row = result.data?.[0] ?? result;
  if (!row.access_token) throw new GraphError({ status: 200, message: "Token qaytmadi" });
  const permissions = Array.isArray(row.permissions) ? row.permissions : String(row.permissions ?? "").split(",").filter(Boolean);
  return { token: row.access_token, userId: row.user_id ? String(row.user_id) : null, permissions };
}

/** Short-lived → long-lived (60 days). Meta requires the token and secret in the query string here. */
export async function exchangeLongLived(shortToken: string) {
  const { appSecret } = appConfig();
  if (!appSecret) throw new GraphError({ status: 0, message: "INSTAGRAM_APP_SECRET yo‘q" });
  const result = await call<{ access_token: string; expires_in: number }>(`${GRAPH_HOST}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: shortToken })}`);
  return { token: result.access_token, expiresAt: new Date(Date.now() + (result.expires_in || 5_184_000) * 1000) };
}

/** A long-lived token that is at least 24 h old → a fresh 60-day token. */
export async function refreshLongLived(token: string) {
  const result = await call<{ access_token: string; expires_in: number }>(`${GRAPH_HOST}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`);
  return { token: result.access_token, expiresAt: new Date(Date.now() + (result.expires_in || 5_184_000) * 1000) };
}

/** user_id (= webhook entry.id) and @username of the connected professional account. */
export async function getMe(token: string) {
  const result = await call<{ user_id?: string | number; username?: string; id?: string; data?: Array<{ user_id?: string | number; username?: string }> }>(graph("me", { fields: "user_id,username" }), { token });
  const row = result.data?.[0] ?? result;
  if (!row.user_id || !row.username) throw new GraphError({ status: 200, message: "Akkaunt ma’lumoti qaytmadi" });
  return { userId: String(row.user_id), username: row.username };
}

export const subscribeWebhooks = (token: string) => call<{ success?: boolean }>(graph("me/subscribed_apps", { subscribed_fields: "comments,messages" }), { method: "POST", token });
export const unsubscribeWebhooks = (token: string) => call<{ success?: boolean }>(graph("me/subscribed_apps"), { method: "DELETE", token });

// ---- Media, replies --------------------------------------------------------------------------------------

export type IgMedia = { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string; comments_count?: number };

/** The latest posts / Reels. Meta lists `caption` as Facebook-Login-only; if the field is refused the list is fetched without it. */
export async function listMedia(token: string, igUserId: string, limit = 24) {
  const base = "id,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count";
  try {
    return (await call<{ data: IgMedia[] }>(graph(`${igUserId}/media`, { fields: `${base},caption`, limit: String(limit) }), { token })).data ?? [];
  } catch (error) {
    if (!(error instanceof GraphError) || error.info.code !== 100) throw error;
    return (await call<{ data: IgMedia[] }>(graph(`${igUserId}/media`, { fields: base, limit: String(limit) }), { token })).data ?? [];
  }
}

/** Name and @username of a person who messaged us (Meta allows it only after they wrote to the account). */
export async function getUserProfile(token: string, igsid: string) {
  const result = await call<{ name?: string; username?: string }>(graph(igsid, { fields: "name,username" }), { token });
  return { name: result.name?.trim() || null, username: result.username?.trim() || null };
}

/** A Direct message to someone who wrote to us (within Meta's 24-hour window). */
export function sendDirectMessage(token: string, igUserId: string, recipientId: string, text: string) {
  return call<{ recipient_id?: string; message_id?: string }>(graph(`${igUserId}/messages`), { method: "POST", token, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) });
}

/** Permalink of one post (for the Telegram notice when the post has no saved settings). */
export async function getMediaPermalink(token: string, mediaId: string) {
  return (await call<{ permalink?: string }>(graph(mediaId, { fields: "permalink" }), { token })).permalink ?? null;
}

/** Private Reply: one Direct message to the person who wrote the comment (within 7 days, once per comment). */
export function sendPrivateReply(token: string, igUserId: string, commentId: string, text: string) {
  return call<{ recipient_id?: string; message_id?: string }>(graph(`${igUserId}/messages`), { method: "POST", token, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }) });
}

/** Public reply under the comment. */
export function replyToComment(token: string, commentId: string, message: string) {
  return call<{ id?: string }>(graph(`${commentId}/replies`), { method: "POST", token, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
}
