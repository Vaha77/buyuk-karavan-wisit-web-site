"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { calculationSchema } from "@/lib/calculations/validation";
function proposalNumber() {
  return `BK-${new Date().getFullYear()}-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}
export async function saveCalculationAction(
  id: string | null,
  raw: unknown,
): Promise<{ id?: string; proposalNumber?: string; error?: string }> {
  const actor = await requireAdmin(),
    parsed = calculationSchema.safeParse(raw);
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ||
        "Hisob-kitob ma’lumotlarini tekshiring.",
    };
  const input = parsed.data,
    header = {
      customerName: input.customerName,
      phone: input.phone || null,
      region: input.region || null,
      projectName: input.projectName,
      capacityTons: input.capacityTons || null,
      cameraCount: input.cameraCount,
      temperatureMin: input.temperatureMin,
      temperatureMax: input.temperatureMax,
      notes: input.notes || null,
      buildingWidth: input.buildingWidth,
      buildingLength: input.buildingLength,
      buildingHeight: input.buildingHeight,
      status: input.status,
      electricityTariff: input.electricityTariff,
      specialistConclusion: input.specialistConclusion || null,
      proposalDate: input.proposalDate
        ? new Date(`${input.proposalDate}T00:00:00.000Z`)
        : null,
      validityDays: input.validityDays,
      paymentTerms: input.paymentTerms || null,
      deliveryTerms: input.deliveryTerms || null,
      installationIncluded: input.installationIncluded,
      transportIncluded: input.transportIncluded,
      commissioningIncluded: input.commissioningIncluded,
      warranty: input.warranty || null,
      commercialNotes: input.commercialNotes || null,
      discountPercent: input.discountPercent,
    };
  const rooms = input.rooms.map((x, order) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    x: x.x,
    y: x.y,
    width: x.width,
    length: x.length,
    height: x.type === "ROOM" ? x.height : null,
    capacityTons: x.type === "ROOM" ? x.capacityTons : null,
    temperatureMin: x.type === "ROOM" ? x.temperatureMin : null,
    temperatureMax: x.type === "ROOM" ? x.temperatureMax : null,
    doorEnabled: x.type === "ROOM" && x.doorEnabled,
    doorSide: x.type === "ROOM" && x.doorEnabled ? x.doorSide : null,
    order,
  }));
  const configurations = input.configurations.map((x, order) => ({
    ...x,
    compressor: x.compressor || null,
    compressorNote: x.compressorNote || null,
    condenser: x.condenser || null,
    condenserNote: x.condenserNote || null,
    evaporator: x.evaporator || null,
    evaporatorNote: x.evaporatorNote || null,
    refrigerant: x.refrigerant || null,
    electricalPanel: x.electricalPanel || null,
    trv: x.trv || null,
    copperPipe: x.copperPipe || null,
    fittings: x.fittings || null,
    freon: x.freon || null,
    installationAccessories: x.installationAccessories || null,
    includedEquipment: x.includedEquipment || null,
    order,
  }));
  const items = input.lineItems.map((x, order) => ({ ...x, order }));
  try {
    let row;
    if (id) {
      const exists = await getDb().calculation.findUnique({
        where: { id },
        select: { id: true, proposalNumber: true },
      });
      if (!exists) return { error: "Hisob-kitob topilmadi." };
      row = await getDb().$transaction(async (tx) => {
        await tx.calculationRoom.deleteMany({ where: { calculationId: id } });
        await tx.calculationConfiguration.deleteMany({
          where: { calculationId: id },
        });
        await tx.calculationLineItem.deleteMany({
          where: { calculationId: id },
        });
        await tx.calculationRoom.createMany({
          data: rooms.map((x) => ({ ...x, calculationId: id })),
        });
        await tx.calculationConfiguration.createMany({
          data: configurations.map((x) => ({ ...x, calculationId: id })),
        });
        if (items.length)
          await tx.calculationLineItem.createMany({
            data: items.map((x) => ({ ...x, calculationId: id })),
          });
        return tx.calculation.update({
          where: { id },
          data: {
            ...header,
            proposalNumber: exists.proposalNumber || proposalNumber(),
          },
        });
      });
    } else
      row = await getDb().calculation.create({
        data: {
          ...header,
          proposalNumber: proposalNumber(),
          createdByAdminId: actor.id,
          rooms: { create: rooms },
          configurations: { create: configurations },
          lineItems: { create: items },
        },
      });
    await writeAudit(actor, {
      action: id ? "UPDATE" : "CREATE",
      entityType: "CALCULATION",
      entityId: row.id,
      entityName: row.projectName,
      summary: id ? "Tijorat taklifini yangiladi" : "Tijorat taklifini yaratdi",
      after: {
        proposalNumber: row.proposalNumber,
        status: row.status,
        configurationCount: configurations.length,
        lineItemCount: items.length,
      },
    });
    revalidatePath("/admin/calculations");
    revalidatePath(`/admin/calculations/${row.id}`);
    return { id: row.id, proposalNumber: row.proposalNumber || undefined };
  } catch (error) {
    console.error("[CalculationSave]", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Taklif saqlanmadi. Qayta urinib ko‘ring." };
  }
}
