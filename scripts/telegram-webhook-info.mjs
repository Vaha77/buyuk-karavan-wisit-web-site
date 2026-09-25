import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(15_000),
});
const body = await response.json().catch(() => null);
if (!response.ok || !body?.ok) throw new Error(`Telegram getWebhookInfo failed with status ${response.status}.`);

console.log(`URL: ${body.result.url || "(not registered)"}`);
console.log(`pending_update_count: ${Number(body.result.pending_update_count) || 0}`);
if (body.result.last_error_message) console.log(`last_error_message: ${body.result.last_error_message}`);
