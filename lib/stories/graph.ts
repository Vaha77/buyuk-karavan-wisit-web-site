import "server-only";
// Instagram content publishing for stories: container (media_type=STORIES, video_url) → status_code → media_publish.
// IG_USER_ID and IG_PUBLISH_TOKEN come from env only; the token goes in the POST body / header, never into a URL or a log.
import { GRAPH_VERSION } from "@/lib/instagram/rules";

export class StoryGraphError extends Error {
  constructor(public status: number, public code: number | undefined, detail: string) { super(detail); this.name = "StoryGraphError"; }
}

function publishConfig() {
  const igUserId = process.env.IG_USER_ID?.trim(), token = process.env.IG_PUBLISH_TOKEN?.trim();
  if (!igUserId || !/^\d{5,30}$/.test(igUserId) || !token) throw new StoryGraphError(0, undefined, "IG_USER_ID yoki IG_PUBLISH_TOKEN sozlanmagan");
  // Instagram Login tokens (IGAA…) live on graph.instagram.com; Facebook Login tokens on graph.facebook.com.
  const host = token.startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com";
  return { igUserId, token, base: `${host}/${GRAPH_VERSION}` };
}

async function call<T>(path: string, init: { method: "GET" | "POST"; params?: Record<string, string> }): Promise<T> {
  const { token, base } = publishConfig();
  const query = init.method === "GET" && init.params ? `?${new URLSearchParams(init.params)}` : "";
  let response: Response;
  try {
    response = await fetch(`${base}/${path}${query}`, {
      method: init.method, cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, ...(init.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(init.method === "POST" ? { body: new URLSearchParams({ ...init.params, access_token: token }) } : {}),
    });
  } catch (error) {
    throw new StoryGraphError(0, undefined, error instanceof Error ? error.name : "Network error");
  }
  const body = await response.json().catch(() => null) as { error?: { code?: number; message?: string } } & Record<string, unknown> | null;
  if (!response.ok || body?.error) {
    const message = (body?.error?.message ?? `HTTP ${response.status}`).replaceAll(token, "[token]").slice(0, 200);
    throw new StoryGraphError(response.status, body?.error?.code, message);
  }
  return body as T;
}

export async function createStoryContainer(videoUrl: string) {
  const { igUserId } = publishConfig();
  const result = await call<{ id?: string }>(`${igUserId}/media`, { method: "POST", params: { media_type: "STORIES", video_url: videoUrl } });
  if (!result.id) throw new StoryGraphError(200, undefined, "Container id qaytmadi");
  return result.id;
}
export async function containerStatus(containerId: string) {
  const result = await call<{ status_code?: string; status?: string }>(containerId, { method: "GET", params: { fields: "status_code,status" } });
  return { statusCode: result.status_code ?? null, status: result.status ?? null };
}
export async function publishContainer(containerId: string) {
  const { igUserId } = publishConfig();
  const result = await call<{ id?: string }>(`${igUserId}/media_publish`, { method: "POST", params: { creation_id: containerId } });
  if (!result.id) throw new StoryGraphError(200, undefined, "Media id qaytmadi");
  return result.id;
}
