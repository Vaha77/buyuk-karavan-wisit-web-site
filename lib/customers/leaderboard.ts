// "Mijozlar reytingi" in the seller cabinet: every active customer, same places as the admin ranking (rankCustomers),
// but a row carries only place, names and the prize — never an amount. Pure, tested.
import { rankCustomers, type CustomerYear } from "../dashboard/rules";

export const LEADERBOARD_SIZES = [10, 30, 50] as const;
export type LeaderRow = { place: number; name: string; seller: string | null; mine: boolean; prize: string | null };

export function buildLeaderboard(customers: CustomerYear[], owners: Map<string, { ownerId: string | null; name: string | null }>, prizes: Record<1 | 2 | 3, string>, sellerId: string, year: number, now: { year: number; month: number }): LeaderRow[] {
  return rankCustomers(customers, year, now).filter(row => row.total > 0).slice(0, LEADERBOARD_SIZES.at(-1)).map(row => {
    const owner = owners.get(row.id);
    return { place: row.place, name: row.name, seller: owner?.name ?? null, mine: !!owner?.ownerId && owner.ownerId === sellerId, prize: row.place <= 3 ? prizes[row.place as 1 | 2 | 3] || null : null };
  });
}
