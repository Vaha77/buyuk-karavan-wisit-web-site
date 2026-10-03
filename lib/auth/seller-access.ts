// What a SELLER may open in /admin. Shared by proxy.ts (403 before rendering) and the tests; every page and
// server action still checks the role itself (requireAdmin rejects SELLER, requireSeller accepts only SELLER).
export const SELLER_HOME = "/admin/my";

export function isSellerPathAllowed(pathname: string) {
  return pathname === SELLER_HOME || pathname.startsWith(`${SELLER_HOME}/`);
}

/** Where a signed-in user lands after login. */
export function homeFor(role: string) { return role === "SELLER" ? SELLER_HOME : "/admin"; }

/** A GET/HEAD page visit (incl. client navigation), as opposed to a POST or a server action call. */
export function isPageRequest(request: { method: string; headers: { has(name: string): boolean } }) {
  return (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
}

/** proxy.ts decision for a SELLER: their section passes, other page visits go to /admin/my, everything else is 403. */
export function sellerAccess(pathname: string, request: { method: string; headers: { has(name: string): boolean } }): "allow" | "redirect" | "forbid" {
  if (isSellerPathAllowed(pathname)) return "allow";
  return isPageRequest(request) ? "redirect" : "forbid";
}
