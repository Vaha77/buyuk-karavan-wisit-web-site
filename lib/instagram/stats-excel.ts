// "Excel yuklab olish" of the Statistika tab: KPIs, funnel, days, posts, audience. No server-only imports (tested).
import ExcelJS from "exceljs";
import { KIND_LABELS } from "./constants";
import { TYPE_LABELS, formatDayUz } from "./insights-rules";
import type { StatsBoard } from "./stats-queries";

const bold = (sheet: ExcelJS.Worksheet) => { sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; };

export function buildStatsWorkbook(board: StatsBoard) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Umumiy");
  summary.columns = [{ header: "Ko‘rsatkich", key: "label", width: 28 }, { header: "Qiymat", key: "value", width: 14 }, { header: "Oldingi davr", key: "previous", width: 14 }, { header: "O‘zgarish, %", key: "change", width: 14 }, { header: "Izoh", key: "extra", width: 30 }];
  summary.addRow({ label: `Davr: ${formatDayUz(board.range.from)} — ${formatDayUz(board.range.to)}` });
  for (const kpi of board.kpis) summary.addRow({ label: kpi.label, value: kpi.value, previous: kpi.previous, change: kpi.change, extra: kpi.extra ?? "" });
  summary.addRow({});
  summary.addRow({ label: "Voronka", value: "Soni", previous: "Konversiya, %" }).font = { bold: true };
  for (const step of board.funnel) summary.addRow({ label: step.label, value: step.value, previous: step.conversion, extra: step.value === null ? "ma’lumot yo‘q" : step.note ?? "" });
  summary.addRow({});
  summary.addRow({ label: "Kommentlar turi" }).font = { bold: true };
  for (const [kind, count] of Object.entries(board.kinds)) summary.addRow({ label: KIND_LABELS[kind as keyof typeof KIND_LABELS], value: count });
  bold(summary);

  const days = workbook.addWorksheet("Kunlik");
  days.columns = [{ header: "Sana", key: "day", width: 14 }, { header: "Like", key: "likes", width: 10 }, { header: "Kommentlar", key: "comments", width: 12 }, { header: "Direct", key: "direct", width: 10 }];
  for (const row of board.daily) days.addRow({ day: formatDayUz(row.day), likes: row.likes, comments: row.comments, direct: row.direct });
  bold(days);

  const posts = workbook.addWorksheet("Postlar");
  posts.columns = [{ header: "Tur", key: "type", width: 8 }, { header: "Sana", key: "date", width: 14 }, { header: "Izoh", key: "caption", width: 40 }, { header: "Havola", key: "permalink", width: 40 }, { header: "Ko‘rish", key: "views", width: 10 }, { header: "Qamrov", key: "reach", width: 10 }, { header: "Like", key: "likes", width: 8 }, { header: "Komment", key: "comments", width: 10 }, { header: "Saqlash", key: "saved", width: 9 }, { header: "Ulashish", key: "shares", width: 9 }, { header: "O‘rt. tomosha, s", key: "watch", width: 14 }, { header: "Direct", key: "direct", width: 8 }, { header: "Lid", key: "leads", width: 6 }, { header: "ER, %", key: "er", width: 8 }];
  for (const post of board.posts) posts.addRow({ type: TYPE_LABELS[post.type] ?? post.type, date: formatDayUz(post.postedAt.slice(0, 10)), caption: post.caption ?? "", permalink: post.permalink ?? "", views: post.views, reach: post.reach, likes: post.likes, comments: post.comments, saved: post.saved, shares: post.shares, watch: post.avgWatchMs === null ? null : Math.round(post.avgWatchMs / 100) / 10, direct: post.direct, leads: post.leads, er: post.er });
  bold(posts);

  const audience = workbook.addWorksheet("Auditoriya");
  audience.columns = [{ header: "Kim", key: "who", width: 18 }, { header: "Bo‘lim", key: "group", width: 10 }, { header: "Qiymat", key: "key", width: 28 }, { header: "Soni", key: "value", width: 10 }];
  if (board.audience) for (const [who, data] of [["Obunachilar", board.audience.follower], ["Reaksiya beruvchilar", board.audience.engaged]] as const) {
    for (const [group, values] of Object.entries(data)) for (const [key, value] of Object.entries(values).sort((a, b) => b[1] - a[1])) audience.addRow({ who, group, key, value });
  }
  bold(audience);
  return workbook;
}
