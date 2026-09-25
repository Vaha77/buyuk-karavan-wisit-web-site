export type TelegramUser = { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string };
export type TelegramChat = { id: number; type: "private"|"group"|"supergroup"|"channel"; title?: string };
export type TelegramMessage = { message_id: number; chat: TelegramChat; from?: TelegramUser; text?: string; new_chat_members?: TelegramUser[] };
export type TelegramCallbackQuery = { id: string; from: TelegramUser; message?: TelegramMessage; data?: string };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };
export type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  return Boolean(value && typeof value === "object" && "update_id" in value && Number.isSafeInteger((value as TelegramUpdate).update_id));
}
