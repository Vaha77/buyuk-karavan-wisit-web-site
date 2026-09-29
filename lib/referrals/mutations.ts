import "server-only";

import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit/service";
import { isValidSlug, REFERRAL_SOURCES, safeTargetPath } from "./rules";
import { expireDashboard } from "./tracking";

export class ReferralLinkError extends Error {}
type Actor = Pick<AdminUser, "id" | "name">;

export const linkInputSchema = z.object({
  name: z.string().trim().min(3, "Link nomini kiriting.").max(120),
  source: z.enum(REFERRAL_SOURCES),
  slug: z.string().trim().toLowerCase().refine(isValidSlug, "Qisqa nom 3–40 belgi: kichik lotin harflari, raqam va chiziqcha."),
  targetPath: z.string().trim().refine(value => !!safeTargetPath(value), "Sahifa manzili noto‘g‘ri."),
  cost: z.string().trim().max(20).refine(value => !value || /^\d+(?:[.,]\d{1,2})?$/.test(value), "Xarajatni raqam bilan kiriting.").transform(value => value ? value.replace(",", ".") : null),
  costCurrency: z.enum(["USD", "UZS"]),
  ownerAgentId: z.string().trim().max(40).transform(value => value || null),
});
export type LinkInput = z.input<typeof linkInputSchema>;

export async function isSlugAvailable(slug: string, excludeId?: string) {
  if (!isValidSlug(slug)) return false;
  const found = await getDb().referralLink.findUnique({ where: { slug }, select: { id: true } });
  return !found || found.id === excludeId;
}

async function checkOwner(ownerAgentId: string | null) {
  if (ownerAgentId && !await getDb().salesAgent.findFirst({ where: { id: ownerAgentId, isApproved: true }, select: { id: true } })) throw new ReferralLinkError("Sotuvchi topilmadi.");
}

export async function createReferralLink(raw: LinkInput, actor: Actor) {
  const input = linkInputSchema.parse(raw);
  if (!await isSlugAvailable(input.slug)) throw new ReferralLinkError("Bu qisqa nom band.");
  await checkOwner(input.ownerAgentId);
  const link = await getDb().referralLink.create({ data: { name: input.name, source: input.source, slug: input.slug, targetPath: safeTargetPath(input.targetPath)!, cost: input.cost, costCurrency: input.cost ? input.costCurrency : null, ownerAgentId: input.ownerAgentId, createdByAdminId: actor.id } });
  await writeAudit(actor, { action: "CREATE", entityType: "REFERRAL_LINK", entityId: link.id, entityName: link.name, summary: "Referal link yaratdi", after: { slug: link.slug, source: link.source, targetPath: link.targetPath, cost: link.cost?.toString() ?? null, costCurrency: link.costCurrency } });
  expireDashboard();
  return link;
}

export async function updateReferralLink(id: string, raw: LinkInput, actor: Actor) {
  const input = linkInputSchema.parse(raw);
  const previous = await getDb().referralLink.findUnique({ where: { id } });
  if (!previous) throw new ReferralLinkError("Link topilmadi.");
  if (!await isSlugAvailable(input.slug, id)) throw new ReferralLinkError("Bu qisqa nom band.");
  // A slug that has already been shared must keep working: it can change only while the link has no visits.
  if (input.slug !== previous.slug && await getDb().visit.count({ where: { referralLinkId: id } })) throw new ReferralLinkError("Tashrif bo‘lgan linkning qisqa nomini o‘zgartirib bo‘lmaydi.");
  await checkOwner(input.ownerAgentId);
  const link = await getDb().referralLink.update({ where: { id }, data: { name: input.name, source: input.source, slug: input.slug, targetPath: safeTargetPath(input.targetPath)!, cost: input.cost, costCurrency: input.cost ? input.costCurrency : null, ownerAgentId: input.ownerAgentId } });
  await writeAudit(actor, { action: "UPDATE", entityType: "REFERRAL_LINK", entityId: id, entityName: link.name, summary: "Referal linkni tahrirladi", before: { name: previous.name, slug: previous.slug, targetPath: previous.targetPath, cost: previous.cost?.toString() ?? null }, after: { name: link.name, slug: link.slug, targetPath: link.targetPath, cost: link.cost?.toString() ?? null } });
  expireDashboard();
  return link;
}

export async function setReferralLinkStatus(id: string, status: "ACTIVE" | "PAUSED", actor: Actor) {
  const link = await getDb().referralLink.update({ where: { id }, data: { status } });
  await writeAudit(actor, { action: status === "ACTIVE" ? "RESUME" : "PAUSE", entityType: "REFERRAL_LINK", entityId: id, entityName: link.name, summary: status === "ACTIVE" ? "Referal linkni qayta yoqdi" : "Referal linkni to‘xtatdi" });
  expireDashboard();
  return link;
}

/** Deleting is allowed only while nobody has visited the link (its statistics would otherwise be lost). */
export async function deleteReferralLink(id: string, actor: Actor) {
  const link = await getDb().referralLink.findUnique({ where: { id }, select: { id: true, name: true, slug: true, _count: { select: { visits: true, leads: true } } } });
  if (!link) throw new ReferralLinkError("Link topilmadi.");
  if (link._count.visits || link._count.leads) throw new ReferralLinkError("Tashrifi bor linkni o‘chirib bo‘lmaydi — uni to‘xtating.");
  await getDb().referralLink.delete({ where: { id } });
  await writeAudit(actor, { action: "DELETE", entityType: "REFERRAL_LINK", entityId: id, entityName: link.name, summary: "Referal linkni o‘chirdi", before: { slug: link.slug } });
  expireDashboard();
}
