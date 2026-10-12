import "server-only";
// BK bot buttons of a story: "✅ Tasdiqlash" · "❌ Rad etish" · "✅ Hammasini tasdiqlash (kun)". Only a Super Admin's own
// chat (AdminUser.telegramChatId of an active SUPER_ADMIN) may press them; anyone else gets "Ruxsat yo‘q".
import { getDb } from "@/lib/db";
import { answerCallbackQuery } from "@/lib/telegram/client";
import type { TelegramCallbackQuery } from "@/lib/telegram/types";
import { parseStoryCallback } from "./rules";
import { approveDay, approveStory, rejectStory } from "./service";

export async function handleStoryCallback(callback: TelegramCallbackQuery) {
  const action = parseStoryCallback(callback.data);
  if (!action) return false;
  const answer = (text: string, alert = false) => answerCallbackQuery(callback.id, text, alert).catch(() => undefined);
  const admin = await getDb().adminUser.findFirst({ where: { telegramChatId: String(callback.from.id), role: "SUPER_ADMIN", isActive: true, archivedAt: null }, select: { id: true, name: true } });
  if (!admin) { await answer("Ruxsat yo‘q — faqat Super Admin", true); return true; }
  if (action.kind === "day") {
    const count = await approveDay(action.day, admin);
    await answer(count ? `${count} ta storis tasdiqlandi ✓` : "Tasdiqlanadigan storis qolmadi");
    return true;
  }
  const result = action.kind === "ok" ? await approveStory(action.id, admin) : await rejectStory(action.id, admin);
  await answer(result.ok ? (action.kind === "ok" ? "Tasdiqlandi ✓" : "Rad etildi") : result.error, !result.ok);
  return true;
}
