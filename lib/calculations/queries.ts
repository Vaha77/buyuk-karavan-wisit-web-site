import "server-only";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import type {
  CalculationConfiguration,
  CalculationDraft,
  CalculationLineItem,
  CalculationListItem,
  PlannerRoom,
  ProductProposalOption,
} from "./types";
const n = (value: unknown) =>
    value === null || value === undefined ? null : Number(value),
  s = (value: string | null) => value || "";
export function defaultRecommended(): CalculationConfiguration {
  return {
    id: crypto.randomUUID(),
    type: "RECOMMENDED",
    label: "Mutaxassis tavsiyasi",
    compressor: "",
    compressorNote: "",
    condenser: "",
    condenserNote: "",
    evaporator: "",
    evaporatorNote: "",
    refrigerant: "",
    electricalPanel: "",
    trv: "",
    copperPipe: "",
    fittings: "",
    freon: "",
    installationAccessories: "",
    includedEquipment: "",
    priceUsd: null,
    powerKw: null,
    operatingHoursPerDay: null,
    order: 0,
  };
}
export async function getCalculations(): Promise<CalculationListItem[]> {
  await requireAdmin();
  const rows = await getDb().calculation.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customerName,
    projectName: row.projectName,
    seller: row.createdBy.name,
    status: row.status,
    proposalNumber: row.proposalNumber || "—",
    updatedAt: row.updatedAt.toISOString(),
  }));
}
export async function getCalculation(
  id: string,
): Promise<CalculationDraft | null> {
  await requireAdmin();
  const row = await getDb().calculation.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      rooms: { orderBy: { order: "asc" } },
      configurations: { orderBy: { order: "asc" } },
      lineItems: { orderBy: { order: "asc" } },
    },
  });
  if (!row) return null;
  const configurations: CalculationConfiguration[] = row.configurations.map(
    (x) => ({
      id: x.id,
      type: x.type,
      label: x.label,
      compressor: s(x.compressor),
      compressorNote: s(x.compressorNote),
      condenser: s(x.condenser),
      condenserNote: s(x.condenserNote),
      evaporator: s(x.evaporator),
      evaporatorNote: s(x.evaporatorNote),
      refrigerant: s(x.refrigerant),
      electricalPanel: s(x.electricalPanel),
      trv: s(x.trv),
      copperPipe: s(x.copperPipe),
      fittings: s(x.fittings),
      freon: s(x.freon),
      installationAccessories: s(x.installationAccessories),
      includedEquipment: s(x.includedEquipment),
      priceUsd: n(x.priceUsd),
      powerKw: n(x.powerKw),
      operatingHoursPerDay: n(x.operatingHoursPerDay),
      order: x.order,
    }),
  );
  const rooms: PlannerRoom[] = row.rooms.map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    x: Number(x.x),
    y: Number(x.y),
    width: Number(x.width),
    length: Number(x.length),
    height: Number(x.height || 0),
    capacityTons: Number(x.capacityTons || 0),
    temperatureMin: Number(x.temperatureMin || 0),
    temperatureMax: Number(x.temperatureMax || 0),
    doorEnabled: x.doorEnabled,
    doorSide: x.doorSide || "BOTTOM",
    order: x.order,
  }));
  const lineItems: CalculationLineItem[] = row.lineItems.map((x) => ({
    id: x.id,
    productId: x.productId,
    name: x.name,
    unit: x.unit,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
    currency: x.currency,
    order: x.order,
  }));
  return {
    id: row.id,
    customerName: row.customerName,
    phone: s(row.phone),
    region: s(row.region),
    projectName: row.projectName,
    capacityTons: Number(row.capacityTons || 0),
    cameraCount: row.cameraCount,
    temperatureMin: Number(row.temperatureMin || 0),
    temperatureMax: Number(row.temperatureMax || 0),
    notes: s(row.notes),
    buildingWidth: Number(row.buildingWidth),
    buildingLength: Number(row.buildingLength),
    buildingHeight: Number(row.buildingHeight),
    status: row.status,
    rooms,
    configurations: configurations.length
      ? configurations
      : [defaultRecommended()],
    lineItems,
    electricityTariff: n(row.electricityTariff),
    specialistConclusion: s(row.specialistConclusion),
    proposalNumber: s(row.proposalNumber),
    proposalDate:
      row.proposalDate?.toISOString().slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    validityDays: row.validityDays,
    paymentTerms: s(row.paymentTerms),
    deliveryTerms: s(row.deliveryTerms),
    installationIncluded: row.installationIncluded,
    transportIncluded: row.transportIncluded,
    commissioningIncluded: row.commissioningIncluded,
    warranty: s(row.warranty),
    commercialNotes: s(row.commercialNotes),
    discountPercent: n(row.discountPercent),
    sellerName: row.createdBy.name,
  };
}
export async function getProposalProductOptions(): Promise<
  ProductProposalOption[]
> {
  await requireAdmin();
  const rows = await getDb().product.findMany({
    select: { id: true, name: true, model: true, priceUsd: true },
    orderBy: [{ name: "asc" }, { model: "asc" }],
  });
  return rows.map((x) => ({ ...x, priceUsd: x.priceUsd?.toString() || null }));
}
