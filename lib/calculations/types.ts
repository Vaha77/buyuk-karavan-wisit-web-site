export type PlannerRoomType = "ROOM" | "CORRIDOR";
export type PlannerDoorSide = "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
export type PlannerStatus =
  | "DRAFT"
  | "READY"
  | "SENT"
  | "NEGOTIATION"
  | "APPROVED"
  | "REJECTED";
export type ConfigurationType = "RECOMMENDED" | "MARKET_1" | "MARKET_2";
export type ProposalCurrency = "USD" | "UZS";
export type PlannerRoom = {
  id: string;
  name: string;
  type: PlannerRoomType;
  x: number;
  y: number;
  width: number;
  length: number;
  height: number;
  capacityTons: number;
  temperatureMin: number;
  temperatureMax: number;
  doorEnabled: boolean;
  doorSide: PlannerDoorSide;
  order: number;
};
export type CalculationConfiguration = {
  id: string;
  type: ConfigurationType;
  label: string;
  compressor: string;
  compressorNote: string;
  condenser: string;
  condenserNote: string;
  evaporator: string;
  evaporatorNote: string;
  refrigerant: string;
  electricalPanel: string;
  trv: string;
  copperPipe: string;
  fittings: string;
  freon: string;
  installationAccessories: string;
  includedEquipment: string;
  priceUsd: number | null;
  powerKw: number | null;
  operatingHoursPerDay: number | null;
  order: number;
};
export type CalculationLineItem = {
  id: string;
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  currency: ProposalCurrency;
  order: number;
};
export type ProductProposalOption = {
  id: string;
  name: string;
  model: string;
  priceUsd: string | null;
};
export type CalculationDraft = {
  id?: string;
  customerName: string;
  phone: string;
  region: string;
  projectName: string;
  capacityTons: number;
  cameraCount: number;
  temperatureMin: number;
  temperatureMax: number;
  notes: string;
  buildingWidth: number;
  buildingLength: number;
  buildingHeight: number;
  status: PlannerStatus;
  rooms: PlannerRoom[];
  configurations: CalculationConfiguration[];
  lineItems: CalculationLineItem[];
  electricityTariff: number | null;
  specialistConclusion: string;
  proposalNumber: string;
  proposalDate: string;
  validityDays: number | null;
  paymentTerms: string;
  deliveryTerms: string;
  installationIncluded: boolean | null;
  transportIncluded: boolean | null;
  commissioningIncluded: boolean | null;
  warranty: string;
  commercialNotes: string;
  discountPercent: number | null;
  sellerName?: string;
  exchangeRate?: number | null;
};
export type CalculationListItem = {
  id: string;
  customerName: string;
  projectName: string;
  seller: string;
  status: PlannerStatus;
  proposalNumber: string;
  updatedAt: string;
};
