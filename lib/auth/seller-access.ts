// What a SELLER may open in /admin. Shared by proxy.ts (403 before rendering) and the tests; every page and
// server action still checks the role itself (requireAdmin rejects SELLER, requireSeller accepts only SELLER).
export const SELLER_HOME = "/admin/my";

export function isSellerPathAllowed(pathname: string) {
  return pathname === SELLER_HOME || pathname.startsWith(`${SELLER_HOME}/`);
}

/** Where a signed-in user lands after login. */
export function homeFor(role: string) { return role === "SELLER" ? SELLER_HOME : "/admin"; }
