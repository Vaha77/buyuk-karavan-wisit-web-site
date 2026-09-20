"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getHomeContent, HomeContentValidationError, persistHomeContent, validateHomeContent } from "@/lib/home/content";
import { deleteOwnedHomeImage, HomeImageValidationError, ownedHomeImageKey, uploadHomeImage } from "@/lib/home/storage";
import type { HomeContent } from "@/data/admin-home";

type Result = { content?: HomeContent; error?: string };

function imageUrls(value: unknown, result = new Set<string>()): Set<string> { if (typeof value === "string" && /^https:\/\//.test(value)) result.add(value); else if (Array.isArray(value)) value.forEach(item => imageUrls(item, result)); else if (value && typeof value === "object") Object.values(value).forEach(item => imageUrls(item, result)); return result; }

async function uploadDataImages(content: HomeContent) {
  const uploaded: string[] = [];
  const walk = async (value: unknown, section: string): Promise<unknown> => {
    if (typeof value === "string" && value.startsWith("data:image/")) { const url = await uploadHomeImage(section, value); uploaded.push(url); return url; }
    if (Array.isArray(value)) return Promise.all(value.map(item => walk(item, section)));
    if (value && typeof value === "object") { const result: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) result[key] = await walk(item, section); return result; }
    return value;
  };
  const result: Record<string, unknown> = {};
  try { for (const [section, value] of Object.entries(content)) result[section] = await walk(value, section); return { content: validateHomeContent(result), uploaded }; }
  catch (error) { await Promise.allSettled(uploaded.map(deleteOwnedHomeImage)); throw error; }
}

export async function saveHomeContentAction(raw: unknown): Promise<Result> {
  await requireAdmin();
  try {
    const oldContent = await getHomeContent();
    const validated = validateHomeContent(raw);
    const prepared = await uploadDataImages(validated);
    try {
      const saved = await persistHomeContent(prepared.content);
      const retained = imageUrls(saved); const oldOwned = [...imageUrls(oldContent)].filter(url => ownedHomeImageKey(url) && !retained.has(url));
      await Promise.allSettled(oldOwned.map(deleteOwnedHomeImage));
      revalidatePath("/"); revalidatePath("/admin/content/home");
      return { content: saved };
    } catch (error) { await Promise.allSettled(prepared.uploaded.map(deleteOwnedHomeImage)); throw error; }
  } catch (error) {
    if (error instanceof HomeContentValidationError || error instanceof HomeImageValidationError) return { error: error.message };
    return { error: "O‘zgarishlarni saqlab bo‘lmadi" };
  }
}
