import "server-only";
import { OAUTH_AUTHORIZE_URL, SCOPES } from "./rules";

export const STATE_COOKIE = "bk_ig_oauth_state";
export const CALLBACK_PATH = "/api/instagram/oauth/callback";

/** Must match a "Valid OAuth Redirect URI" in the Meta app exactly (https://buyukkaravan.com/api/instagram/oauth/callback). */
export const redirectUri = (origin: string) => new URL(CALLBACK_PATH, origin).toString();

export function authorizeUrl(appId: string, origin: string, state: string) {
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri(origin), response_type: "code", scope: SCOPES.join(","), state, enable_fb_login: "false", force_reauth: "true" }).toString();
  return url.toString();
}

/** Origin of the current request (Vercel sets x-forwarded-host / -proto). */
export function requestOrigin(headers: Headers) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "buyukkaravan.com";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
