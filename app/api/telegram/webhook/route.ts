import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { answerCallbackQuery, telegramErrorDetails, telegramWebhookSecret } from "@/lib/telegram/client";
import { handleTelegramUpdate } from "@/lib/telegram/service";
import { isTelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";

function validSecret(received: string | null) {
  try {
    if (!received) return false;
    const expected = Buffer.from(telegramWebhookSecret());
    const actual = Buffer.from(received);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function uniqueError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function GET(request: Request) {
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const latest = await getDb().telegramUpdate.aggregate({ _max: { updateId: true } });
  return NextResponse.json({ ok: true, nextOffset: latest._max.updateId === null ? 0 : Number(latest._max.updateId) + 1 });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_000_000) return NextResponse.json({ ok: false }, { status: 413 });

  const update: unknown = await request.json().catch(() => null);
  if (!isTelegramUpdate(update)) return NextResponse.json({ ok: false }, { status: 400 });
  timings.webhook_received_ms = Math.round(performance.now() - startedAt);

  // Start acknowledgement before database idempotency or any handler work.
  const callbackAck = update.callback_query
    ? answerCallbackQuery(update.callback_query.id, "So‘rov qabul qilindi.")
        .then(() => { timings.callback_ack_ms = Math.round(performance.now() - startedAt); })
        .catch((error) => {
          timings.callback_ack_ms = -1;
          console.error("Telegram callback acknowledgement failed", telegramErrorDetails(error));
        })
    : undefined;

  try {
    await getDb().telegramUpdate.create({ data: { updateId: BigInt(update.update_id) } });
  } catch (error) {
    if (uniqueError(error)) {
      await callbackAck;
      timings.total_ms = Math.round(performance.now() - startedAt);
      console.info("Telegram webhook performance", timings);
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  try {
    await handleTelegramUpdate(update, { callbackAcknowledged: Boolean(callbackAck), timings });
    await callbackAck;
    timings.total_ms = Math.round(performance.now() - startedAt);
    console.info("Telegram webhook performance", timings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // A failed update must remain retryable. No update payload or customer data is logged.
    await getDb().telegramUpdate.deleteMany({ where: { updateId: BigInt(update.update_id) } }).catch(() => undefined);
    await callbackAck;
    timings.total_ms = Math.round(performance.now() - startedAt);
    console.info("Telegram webhook performance", timings);
    console.error("Telegram update processing failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
