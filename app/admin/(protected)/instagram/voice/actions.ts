"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { resolveStoryAccount } from "@/lib/stories/service";
import { MIGRATION_NEEDED, isMissingTable, parseTtsRequest, type TtsRequestInput } from "@/lib/tts/rules";
import { deleteGeneration, generateFull, generatePreview, generateSample, type TtsResult } from "@/lib/tts/service";

export type VoiceActionResult = Extract<TtsResult, { ok: true }> | { ok: false; error: string };
const actor = async () => (await requireRole("SUPER_ADMIN")).name;
const failed = (error: unknown): VoiceActionResult => {
  console.error("Voice studio action failed", { type: error instanceof Error ? error.name : "UnknownError" });
  if (isMissingTable(error)) return { ok: false, error: MIGRATION_NEEDED };
  return { ok: false, error: error instanceof Error && /storage is not configured/i.test(error.message) ? "Storage sozlanmagan." : "Ovoz yasab bo‘lmadi." };
};
const answer = (result: TtsResult): VoiceActionResult => result.ok ? result : { ok: false, error: result.error };

/** "Sinab eshitish": the first ~200 characters → an inline player (not saved to the history). */
export async function previewVoiceAction(input: TtsRequestInput): Promise<VoiceActionResult> {
  const name = await actor();
  const parsed = parseTtsRequest(input);
  if (!parsed.ok) return parsed;
  try { return answer(await generatePreview(parsed.value, name)); } catch (error) { return failed(error); }
}

/** "Ovoz yasash": the whole script → a stored MP3 / WAV in the selected account's history. */
export async function generateVoiceAction(input: TtsRequestInput, accountId: string): Promise<VoiceActionResult> {
  const name = await actor();
  const parsed = parseTtsRequest(input);
  if (!parsed.ok) return parsed;
  const account = await resolveStoryAccount(accountId);
  if (!account) return { ok: false, error: "Akkaunt topilmadi." };
  try {
    const result = answer(await generateFull(parsed.value, { source: "admin", actor: name, accountId: account }));
    revalidatePath("/admin/instagram/voice");
    return result;
  } catch (error) { return failed(error); }
}

/** "Ovozlar galereyasi": one voice reads the language's sample sentence (cached after the first time). */
export async function sampleVoiceAction(input: Omit<TtsRequestInput, "text">): Promise<VoiceActionResult> {
  const name = await actor();
  const parsed = parseTtsRequest({ ...input, text: "-" });
  if (!parsed.ok) return parsed;
  const { lang, provider, voice, speed, format } = parsed.value;
  try { return answer(await generateSample({ lang, provider, voice, speed, format }, name)); } catch (error) { return failed(error); }
}

export async function deleteVoiceAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await actor();
  const result = await deleteGeneration(String(id)).catch(error => { if (isMissingTable(error)) return { ok: false as const, error: MIGRATION_NEEDED }; throw error; });
  revalidatePath("/admin/instagram/voice");
  return result;
}
