import "server-only";
import { getDb } from "@/lib/db";
import { readProduct360Sources, type Product360View } from "./types";

function mapAsset(asset: { id: string; productId: string; status: "DRAFT" | "PROCESSING" | "READY" | "FAILED"; sourceImages: unknown; frames: string[]; frameCount: number; posterImage: string | null }): Product360View {
  return { ...asset, sourceImages: readProduct360Sources(asset.sourceImages), posterImage: asset.posterImage ?? undefined };
}

export async function getAdminProduct360Assets() {
  return (await getDb().product360Asset.findMany()).map(mapAsset);
}

export async function getReadyProduct360Asset(productId: string) {
  const asset = await getDb().product360Asset.findUnique({ where: { productId } });
  if (!asset || asset.status !== "READY" || asset.frameCount < 12 || asset.frameCount !== asset.frames.length || asset.frames.some(frame => !frame)) return null;
  return mapAsset(asset);
}
