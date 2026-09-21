import "dotenv/config";
import { createHash } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

const localWebhookUrl = process.env.TELEGRAM_LOCAL_WEBHOOK_URL || "http://localhost:3000/api/telegram/webhook";
const webhookSecret = createHash("sha256").update(token).digest("hex");
const lockPath = join(tmpdir(), `bklead-telegram-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16)}.lock`);
let offset = 0;
let stopping = false;
let activeRequest;
let lockHandle;
let ownsLock = false;

function stop() {
  if (!stopping) console.log("Stopping Telegram development polling...");
  stopping = true;
  activeRequest?.abort();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

async function telegram(method, payload = {}, timeout = 40_000) {
  const controller = new AbortController();
  activeRequest = controller;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
  });
  activeRequest = undefined;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(`Telegram ${method} failed with status ${response.status}.`);
  return body.result;
}

async function preparePolling() {
  const webhook = await telegram("getWebhookInfo");
  if (webhook?.url) {
    await telegram("deleteWebhook", { drop_pending_updates: false });
    console.log("Active webhook removed; pending updates were preserved.");
  }
}

function processIsRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function acquirePollerLock() {
  try {
    lockHandle = await open(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existingPid = Number(await readFile(lockPath, "utf8").catch(() => "0"));
    if (Number.isInteger(existingPid) && existingPid > 0 && processIsRunning(existingPid)) {
      throw new Error("Another Telegram development poller is already running.");
    }
    await unlink(lockPath).catch(() => undefined);
    lockHandle = await open(lockPath, "wx");
  }
  await lockHandle.writeFile(String(process.pid));
  ownsLock = true;
}

async function releasePollerLock() {
  if (!ownsLock) return;
  await lockHandle?.close().catch(() => undefined);
  await unlink(lockPath).catch(() => undefined);
  ownsLock = false;
}

async function loadPersistedOffset() {
  const response = await fetch(localWebhookUrl, {
    headers: { "x-telegram-bot-api-secret-token": webhookSecret },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !Number.isSafeInteger(body.nextOffset)) {
    throw new Error(`Local Telegram offset lookup returned status ${response.status}.`);
  }
  offset = body.nextOffset;
}

async function deliverLocally(update) {
  const controller = new AbortController();
  activeRequest = controller;
  const response = await fetch(localWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(update),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
  });
  activeRequest = undefined;
  if (!response.ok) throw new Error(`Local Telegram handler returned status ${response.status}.`);
}

async function waitBeforeRetry() {
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

try {
  await acquirePollerLock();
  await preparePolling();
  await loadPersistedOffset();
  console.log(`Telegram development polling started. Local handler: ${localWebhookUrl}`);

  while (!stopping) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });
      if (!Array.isArray(updates)) throw new Error("Telegram getUpdates returned an invalid response.");
      for (const update of updates) {
        if (stopping) break;
        await deliverLocally(update);
        offset = update.update_id + 1;
      }
    } catch (error) {
      if (stopping) break;
      console.error("Telegram polling temporarily failed.", {
        type: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      await waitBeforeRetry();
    }
  }
} finally {
  await releasePollerLock();
}

console.log("Telegram development polling stopped.");
