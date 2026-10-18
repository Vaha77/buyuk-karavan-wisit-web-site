"use server";

import { requireSexUser } from "@/lib/auth/require-admin";
import { globalSearch } from "@/lib/search/service";

/** Admin "Qidirish": any signed-in role; what it finds is limited per role in lib/search/plan.ts. */
export async function globalSearchAction(query: unknown) {
  const user = await requireSexUser();
  return typeof query === "string" ? globalSearch(user, query.slice(0, 80)) : [];
}
