// Seller-facing view of the Sotuv rejasi board. A SELLER sees everyone's rank, name, completion % and zone, and
// only their OWN total and plan: other people's sums, plans and monthly numbers never leave this function.
import type { PlanBoard } from "./rules";
import { zoneStyle, type ZoneKey } from "./zones";

export type RankingRow = { rank: number; name: string; percent: number; zone: ZoneKey; isMe: boolean };
export type MyPlace = {
  rank: number; count: number; percent: number; zone: ZoneKey; total: number; plan: number;
  /** USD still needed to reach the completion % of the person one place above; null when already first. */
  toNext: number | null;
  /** USD still needed to reach the "excellent" line (0 when already there), with that line's % and label. */
  toExcellent: number; excellentPercent: number; excellentLabel: string;
};
export type SellerRanking = { rows: RankingRow[]; me: MyPlace | null };

const ceilUsd = (value: number) => Math.max(0, Math.ceil(value));

/** Everyone with a plan in the period, by completion % (then name); `me` = the viewer's SalesPerson id. */
export function sellerRanking(board: PlanBoard, me: string | null): SellerRanking {
  const people = board.groups.flatMap(group => group.people).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  const rows: RankingRow[] = people.map((person, index) => ({ rank: index + 1, name: person.name, percent: person.percent, zone: person.zone, isMe: person.id === me }));
  const index = me ? people.findIndex(person => person.id === me) : -1;
  if (index < 0) return { rows, me: null };
  const mine = people[index], above = index > 0 ? people[index - 1] : null;
  const excellentPercent = board.thresholds.excellent;
  return {
    rows,
    me: {
      rank: index + 1, count: people.length, percent: mine.percent, zone: mine.zone, total: mine.total, plan: mine.plan,
      toNext: above ? ceilUsd((above.percent / 100) * mine.plan - mine.total) : null,
      toExcellent: ceilUsd((excellentPercent / 100) * mine.plan - mine.total), excellentPercent, excellentLabel: zoneStyle("excellent").label,
    },
  };
}
