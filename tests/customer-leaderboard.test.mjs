import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const { buildLeaderboard, LEADERBOARD_SIZES } = await import("../lib/customers/leaderboard.ts");
const regions = await import("../lib/dashboard/regions.ts");

const months = (...values) => [...values, ...Array(12 - values.length).fill(null)];
const customers = [
  { id: "a", name: "Alfa", regionCode: "UZ-SA", months: months(1000, 500) },
  { id: "b", name: "Beta", regionCode: "UZ-TK", months: months(4000) },
  { id: "c", name: "Gamma", regionCode: null, months: months(800, 700) },
  { id: "d", name: "Delta", regionCode: null, months: months(100) },
  { id: "z", name: "Zero", regionCode: null, months: months() },
  ...Array.from({ length: 60 }, (_, index) => ({ id: `x${index}`, name: `X${String(index).padStart(2, "0")}`, regionCode: null, months: months(10) })),
];
const owners = new Map([["a", { ownerId: "sp-a", name: "Ali" }], ["b", { ownerId: "sp-b", name: "Bobur" }], ["c", { ownerId: "sp-a", name: "Ali" }]]);
const prizes = { 1: "Umra safari", 2: "Televizor", 3: "" };
const board = buildLeaderboard(customers, owners, prizes, "sp-a", 2026, { year: 2026, month: 10 });

test("ranked by this year's approved total; ties by name; zero totals and >50 dropped", () => {
  assert.deepEqual(board.slice(0, 4).map(row => [row.place, row.name]), [[1, "Beta"], [2, "Alfa"], [3, "Gamma"], [4, "Delta"]]);
  assert.equal(board.length, LEADERBOARD_SIZES.at(-1));
  assert.ok(!board.some(row => row.name === "Zero"));
  assert.deepEqual(LEADERBOARD_SIZES, [10, 30, 50]);
});

test("prizes only for places 1–3, own customers are marked", () => {
  assert.deepEqual(board.slice(0, 4).map(row => row.prize), ["Umra safari", "Televizor", null, null]);
  assert.deepEqual(board.filter(row => row.mine).map(row => row.name), ["Alfa", "Gamma"]);
  assert.deepEqual([board[0].seller, board[3].seller], ["Bobur", null]);
});

test("no amount ever reaches the seller", () => {
  for (const row of board) assert.deepEqual(Object.keys(row).sort(), ["mine", "name", "place", "prize", "seller"]);
  assert.ok(!/4000|1500|"total"|"months"/.test(JSON.stringify(board)));
});

test("region lists follow the chosen country", () => {
  assert.deepEqual([...regions.CUSTOMER_COUNTRIES], ["UZ", "KZ", "KG", "TJ", "TM"]);
  const counts = Object.fromEntries(regions.CUSTOMER_COUNTRIES.map(code => [code, regions.regionsOf(code).length]));
  assert.deepEqual(counts, { UZ: 14, KZ: 20, KG: 9, TJ: 5, TM: 6 });
  assert.deepEqual(["KZ-ABA", "KZ-ZHT", "KZ-ULY", "KG-GO", "TM-S"].map(code => regions.REGION_BY_CODE.get(code).parent), ["KZ-VOS", "KZ-ALA", "KZ-KAR", "KG-O", "TM-A"]);
  assert.ok(regions.countsFor("KZ-ABA", "KZ-VOS") && regions.countsFor("KZ-ABA", "KZ-ABA") && !regions.countsFor("KZ-VOS", "KZ-ABA"));
  assert.ok(regions.regionsOf("KZ").every(region => region.code.startsWith("KZ-")));
  assert.ok(regions.isRegionOf("KG-O", "KG") && !regions.isRegionOf("KG-O", "UZ"));
  assert.ok(!regions.CUSTOMER_REGIONS.some(region => region.country === "AF"));
});
