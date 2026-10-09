// What a SELLER or WORKSHOP user may open in /admin. Shared by proxy.ts (403 before rendering) and the tests; every
// page and server action still checks the role itself (requireAdmin rejects both, requireSeller / requireSexUser accept them).
export const SELLER_HOME = "/admin/my";
/** Seh zakazlari: sellers order here, the workshop (WORKSHOP) works only here. */
export const SEX_HOME = "/admin/seh";

/** "Yangi parol o‘rnating" after a password reset: every role may open it. */
export const PASSWORD_PAGE = "/admin/password";

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function isSellerPathAllowed(pathname: string) {
  return within(pathname, SELLER_HOME) || within(pathname, SEX_HOME);
}
export function isWorkshopPathAllowed(pathname: string) {
  return within(pathname, SEX_HOME);
}

/** Roles limited to their own section; everyone else is admin-panel staff. */
export const LIMITED_ROLES = ["SELLER", "WORKSHOP"] as const;
export function isLimitedRole(role: string) { return (LIMITED_ROLES as readonly string[]).includes(role); }

/** Where a signed-in user lands after login (and where a limited role is sent from other pages). */
export function homeFor(role: string) { return role === "SELLER" ? SELLER_HOME : role === "WORKSHOP" ? SEX_HOME : "/admin"; }

/** A GET/HEAD page visit (incl. client navigation), as opposed to a POST or a server action call. */
export function isPageRequest(request: { method: string; headers: { has(name: string): boolean } }) {
  return (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
}

type RequestLike = { method: string; headers: { has(name: string): boolean } };
/** proxy.ts decision for a SELLER: their section passes, other page visits go to /admin/my, everything else is 403. */
export function sellerAccess(pathname: string, request: RequestLike): "allow" | "redirect" | "forbid" {
  if (isSellerPathAllowed(pathname)) return "allow";
  return isPageRequest(request) ? "redirect" : "forbid";
}

/** proxy.ts decision for any role: staff pass, SELLER / WORKSHOP only reach their own section. */
export function roleAccess(role: string, pathname: string, request: RequestLike): "allow" | "redirect" | "forbid" {
  if (pathname === PASSWORD_PAGE) return "allow";
  if (role === "SELLER") return sellerAccess(pathname, request);
  if (role === "WORKSHOP") return isWorkshopPathAllowed(pathname) ? "allow" : isPageRequest(request) ? "redirect" : "forbid";
  return "allow";
}
