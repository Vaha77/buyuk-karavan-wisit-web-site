// Initial sales plan: period "Mart – Avgust 2026" and the agreed plans with monthly results (USD), March → August.
// Used by scripts/seed-sales-plan.mjs (idempotent) and by the reference-totals test.
type SeedPerson = { name: string; kind: "EMPLOYEE" | "BRANCH"; branchHead: string | null; plan: number; months: number[] };

export const SEED_PERIOD = { name: "Mart – Avgust 2026", startYear: 2026, startMonth: 3, monthCount: 6 };

export const SEED_PEOPLE: SeedPerson[] = [
  { name: "Atxamaka", kind: "EMPLOYEE", branchHead: null, plan: 1_500_000, months: [166556, 168314, 235145, 297040, 127233, 158764] },
  { name: "Anasxon aka", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [47552, 11332, 23316, 8335, 11064, 10938] },
  { name: "Abror", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [12871, 36337, 1300, 29055, 17350, 11097] },
  { name: "Abduraxmon", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [22059, 15197, 64438, 56138, 12713, 16797] },
  { name: "Sirojiddin aka", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [59537, 92285, 75165, 43518, 51430, 53175] },
  { name: "Bositxon aka", kind: "EMPLOYEE", branchHead: null, plan: 500_000, months: [31954, 63104, 44857, 78872, 48188, 48231] },
  { name: "Abdulquddus", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [6497, 10694, 17636, 5755, 2910, 12831] },
  { name: "Akramboy aka", kind: "EMPLOYEE", branchHead: null, plan: 250_000, months: [7715, 7724, 11648, 147975, 11925, 9519] },
  { name: "Samarqand filiali", kind: "BRANCH", branchHead: "Azizbek aka", plan: 500_000, months: [28893, 23415, 26804, 34806, 38503, 30731] },
  { name: "Lola filiali", kind: "BRANCH", branchHead: "Abdurazzoq", plan: 500_000, months: [79625, 57276, 21899, 18121, 15022, 25918] },
];
