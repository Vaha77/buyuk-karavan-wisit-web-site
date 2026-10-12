import "server-only";
// Sends one Lead to Meta's Conversions API (same event_id as the browser Pixel → deduplicated). Without
// NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_ACCESS_TOKEN it does nothing. The token goes in the POST body, never in
// a URL or a log line; failures are logged by type only.
import { META_GRAPH_VERSION, buildLeadEvent, metaConfig, type LeadEventInput } from "./capi-rules";

export async function sendLeadToMeta(input: LeadEventInput) {
  const { pixelId, token } = metaConfig();
  if (!pixelId || !token) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [buildLeadEvent(input)], access_token: token }),
    });
    if (!response.ok) console.error("Meta CAPI rejected", { status: response.status });
    return response.ok;
  } catch (error) {
    console.error("Meta CAPI failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return false;
  }
}
