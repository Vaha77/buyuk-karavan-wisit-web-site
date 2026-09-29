import { getDb } from "@/lib/db";
import { isBot, isValidSlug, safeTargetPath, withUtm } from "@/lib/referrals/rules";
import { createVisit, HANDOFF_PARAM, isTrackingId, newVisitorId, VISITOR_COOKIE } from "@/lib/referrals/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(request: Request, location: string) {
  return new Response(null, { status: 302, headers: { Location: new URL(location, request.url).toString(), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

// Referral link: /r/<slug> → target page with UTM tags. Unknown or paused links go home and log nothing;
// bots and link-preview fetchers are redirected without being counted. No cookies are set here: the
// visit id is handed to the tracker, which stores cookies only after the cookie notice has been shown.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  if (!isValidSlug(slug)) return redirect(request, "/");
  const link = await getDb().referralLink.findUnique({ where: { slug }, select: { id: true, status: true, targetPath: true } }).catch(() => null);
  if (!link || link.status !== "ACTIVE") return redirect(request, "/");
  const target = withUtm(safeTargetPath(link.targetPath) || "/", slug);
  if (isBot(request.headers.get("user-agent")) || request.method !== "GET") return redirect(request, target);

  const known = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`))?.[1];
  const visitorId = isTrackingId(known) ? known : newVisitorId();
  try {
    const visit = await createVisit({ linkId: link.id, visitorId, headers: request.headers });
    const url = new URL(target, request.url);
    url.searchParams.set(HANDOFF_PARAM, `${visit.id}~${visitorId}~${link.id}`);
    return redirect(request, `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    console.error("[ReferralRedirect]", { name: error instanceof Error ? error.name : "UnknownError" });
    return redirect(request, target);
  }
}
