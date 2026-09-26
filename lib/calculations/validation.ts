import { z } from "zod";
import { geometryWarnings } from "./geometry";
const positive = z.number().finite().positive().max(1_000_000),
  optionalNumber = z.number().finite().min(0).max(1_000_000_000).nullable(),
  text = (max: number) => z.string().trim().max(max);
const room = z.object({
  id: z.string().uuid(),
  name: text(80).min(1),
  type: z.enum(["ROOM", "CORRIDOR"]),
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(1000),
  width: positive,
  length: positive,
  height: z.number().finite().min(0).max(100),
  capacityTons: z.number().finite().min(0).max(100000),
  temperatureMin: z.number().finite().min(-100).max(1000),
  temperatureMax: z.number().finite().min(-100).max(1000),
  doorEnabled: z.boolean(),
  doorSide: z.enum(["TOP", "BOTTOM", "LEFT", "RIGHT"]),
  order: z.number().int().min(0).max(999),
});
const configuration = z.object({
  id: z.string().uuid(),
  type: z.enum(["RECOMMENDED", "MARKET_1", "MARKET_2"]),
  label: text(80).min(1),
  compressor: text(200),
  compressorNote: text(500),
  condenser: text(200),
  condenserNote: text(500),
  evaporator: text(200),
  evaporatorNote: text(500),
  refrigerant: text(100),
  electricalPanel: text(300),
  trv: text(200),
  copperPipe: text(300),
  fittings: text(300),
  freon: text(200),
  installationAccessories: text(1000),
  includedEquipment: text(3000),
  priceUsd: optionalNumber,
  powerKw: optionalNumber,
  operatingHoursPerDay: z.number().finite().min(0).max(24).nullable(),
  order: z.number().int().min(0).max(2),
});
const lineItem = z.object({
  id: z.string().uuid(),
  productId: z.string().cuid().nullable(),
  name: text(300).min(1),
  unit: text(40).min(1),
  quantity: positive,
  unitPrice: z.number().finite().min(0).max(1_000_000_000),
  currency: z.enum(["USD", "UZS"]),
  order: z.number().int().min(0).max(999),
});
export const calculationSchema = z
  .object({
    customerName: text(160).min(1, "Mijoz nomini kiriting."),
    phone: text(40),
    region: text(160),
    projectName: text(200).min(1, "Loyiha nomini kiriting."),
    capacityTons: z.number().finite().min(0).max(100000),
    cameraCount: z.number().int().min(0).max(100),
    temperatureMin: z.number().finite().min(-100).max(1000),
    temperatureMax: z.number().finite().min(-100).max(1000),
    notes: text(4000),
    buildingWidth: positive,
    buildingLength: positive,
    buildingHeight: positive,
    status: z.enum([
      "DRAFT",
      "READY",
      "SENT",
      "NEGOTIATION",
      "APPROVED",
      "REJECTED",
    ]),
    rooms: z.array(room).max(100),
    configurations: z.array(configuration).min(1).max(3),
    lineItems: z.array(lineItem).max(300),
    electricityTariff: optionalNumber,
    specialistConclusion: text(4000),
    proposalNumber: text(40),
    proposalDate: text(20),
    validityDays: z.number().int().min(1).max(365).nullable(),
    paymentTerms: text(2000),
    deliveryTerms: text(2000),
    installationIncluded: z.boolean().nullable(),
    transportIncluded: z.boolean().nullable(),
    commissioningIncluded: z.boolean().nullable(),
    warranty: text(1000),
    commercialNotes: text(3000),
    discountPercent: z.number().finite().min(0).max(100).nullable(),
    sellerName: text(160).optional(),
    exchangeRate: optionalNumber.optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.rooms.map((x) => x.id)).size !== value.rooms.length)
      ctx.addIssue({
        code: "custom",
        path: ["rooms"],
        message: "Kamera identifikatorlari takrorlanmasligi kerak.",
      });
    if (
      new Set(value.configurations.map((x) => x.type)).size !==
      value.configurations.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["configurations"],
        message: "Konfiguratsiya turlari takrorlanmasligi kerak.",
      });
    if (!value.configurations.some((x) => x.type === "RECOMMENDED"))
      ctx.addIssue({
        code: "custom",
        path: ["configurations"],
        message: "Mutaxassis tavsiyasi saqlanishi kerak.",
      });
    const warnings = geometryWarnings(
      value.rooms,
      value.buildingWidth,
      value.buildingLength,
    );
    if (warnings.outside)
      ctx.addIssue({
        code: "custom",
        path: ["rooms"],
        message: "Kamera bino chegarasidan tashqariga chiqdi.",
      });
    if (warnings.overlap)
      ctx.addIssue({
        code: "custom",
        path: ["rooms"],
        message: "Kameralar bir-birining ustiga tushib qolgan.",
      });
  });
export type CalculationInput = z.infer<typeof calculationSchema>;
