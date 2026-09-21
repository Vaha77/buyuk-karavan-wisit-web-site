import "dotenv/config";
import { createHash } from "node:crypto";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

const endpoint = process.env.FOLLOWUPS_LOCAL_URL || "http://localhost:3000/api/telegram/followups";
const secret = createHash("sha256").update(token).digest("hex");
let stopping = false;
let activeRequest;

function stop() {
  if (!stopping) console.log("Stopping follow-up worker...");
  stopping = true;
  activeRequest?.abort();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

async function runOnce() {
  const controller = new AbortController();
  activeRequest = controller;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
  });
  activeRequest = undefined;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(`Local follow-up handler returned status ${response.status}.`);
  if (body.sent > 0) console.log(`Follow-up reminders sent: ${body.sent}`);
}

console.log(`Follow-up worker started. Local handler: ${endpoint}`);
while (!stopping) {
  try {
    await runOnce();
  } catch (error) {
    if (!stopping) console.error("Follow-up check temporarily failed.", { type: error instanceof Error ? error.name : "UnknownError" });
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 30_000));
}
console.log("Follow-up worker stopped.");
