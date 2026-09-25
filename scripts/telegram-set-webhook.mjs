import "dotenv/config";
import { createHash } from "node:crypto";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const configuredUrl = (process.argv[2] || process.env.TELEGRAM_WEBHOOK_URL)?.trim();
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");
if (!configuredUrl) throw new Error("Provide TELEGRAM_WEBHOOK_URL or an HTTPS webhook URL as the first argument.");

const webhookUrl = new URL(configuredUrl);
if (webhookUrl.protocol !== "https:" || webhookUrl.username || webhookUrl.password || webhookUrl.hash) {
  throw new Error("TELEGRAM_WEBHOOK_URL must be a clean HTTPS URL.");
}
if (["localhost", "127.0.0.1", "::1"].includes(webhookUrl.hostname.toLowerCase())) {
  throw new Error("TELEGRAM_WEBHOOK_URL must use the production domain, not localhost.");
}
if (webhookUrl.pathname.replace(/\/$/, "") !== "/api/telegram/webhook" || webhookUrl.search) {
  throw new Error("TELEGRAM_WEBHOOK_URL must end with /api/telegram/webhook and must not contain a query string.");
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(`Telegram ${method} failed with status ${response.status}.`);
  return body.result;
}

const secret = createHash("sha256").update(token).digest("hex");
await telegram("setWebhook", {
  url: webhookUrl.href,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false,
  max_connections: 1,
});
const info = await telegram("getWebhookInfo");
if (info?.url !== webhookUrl.href) throw new Error("Telegram returned a different webhook URL after registration.");

console.log("Telegram webhook registered and verified.");
console.log(`URL: ${info.url}`);
console.log(`pending_update_count: ${Number(info.pending_update_count) || 0}`);
if (info.last_error_message) console.log(`last_error_message: ${info.last_error_message}`);
