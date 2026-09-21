import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ drop_pending_updates: false }),
  signal: AbortSignal.timeout(10_000),
});
const result = await response.json().catch(() => null);
if (!response.ok || !result?.ok) throw new Error("Telegram webhook removal failed.");

console.log("Telegram webhook removed; pending updates were preserved.");
