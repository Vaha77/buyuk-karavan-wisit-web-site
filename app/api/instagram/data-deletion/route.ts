import { NextResponse } from "next/server";
import { appConfig } from "@/lib/instagram/graph";
import { deleteInstagramUserData } from "@/lib/instagram/data-deletion";
import { deletionStatusUrl, parseSignedRequest } from "@/lib/instagram/deletion-rules";
import { SITE_URL } from "@/lib/site-url";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Meta "Data Deletion Request URL" (Instagram app settings). Meta POSTs signed_request (form-encoded), signed with
 * INSTAGRAM_APP_SECRET; a bad signature → 400. The user's Instagram data is deleted at once and Meta gets
 * { url, confirmation_code } — the url is the public status page /data-deletion?code=…
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const raw = await request.text().catch(() => "");
  const type = request.headers.get("content-type") ?? "";
  let signed: string | null = null;
  if (type.includes("application/json")) { try { signed = (JSON.parse(raw) as { signed_request?: string }).signed_request ?? null; } catch { signed = null; } }
  else signed = new URLSearchParams(raw).get("signed_request");
  const payload = parseSignedRequest(signed, appConfig().appSecret);
  if (!payload) return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  try {
    const result = await deleteInstagramUserData(payload.userId);
    return NextResponse.json({ url: deletionStatusUrl(SITE_URL, result.code), confirmation_code: result.code });
  } catch (error) {
    console.error("Instagram data deletion failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "deletion_failed" }, { status: 500 });
  }
}
