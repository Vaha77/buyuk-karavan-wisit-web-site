import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-admin";
import { kassaTg } from "@/lib/kassa/bot";

export const runtime = "nodejs";

/** "Botni ulash" (Kassa → Sozlamalar): points the BK Kassa bot's webhook at this site and sets its commands. */
export async function POST(request: Request) {
  await requireRole("SUPER_ADMIN");
  const back = (result: string) => NextResponse.redirect(new URL(`/admin/kassa?bot=${result}`, request.url), 303);
  const secret = process.env.KASSA_BOT_WEBHOOK_SECRET?.trim();
  if (!secret || !process.env.KASSA_BOT_OWNER_TG_ID?.trim()) return back("env");
  try {
    await kassaTg("setWebhook", { url: new URL("/api/kassa-bot/webhook", request.url).toString(), secret_token: secret, allowed_updates: ["message", "callback_query"] });
    await kassaTg("setMyCommands", { commands: [{ command: "start", description: "Yo‘riqnoma va misollar" }, { command: "kutmoqda", description: "Tasdiqlash kutayotganlar" }] });
    return back("ok");
  } catch (error) {
    console.error("Kassa bot setup failed", { message: error instanceof Error ? error.message : "UnknownError" });
    return back("error");
  }
}
