export type LeadField = "requestType" | "product" | "dimensions" | "capacity" | "temperature" | "region" | "customerName" | "phone";

export type MadinaLead = {
  customerName: string;
  phone: string;
  telegram: string;
  requestType: string;
  product: string;
  dimensions: string;
  capacity: string;
  temperature: string;
  region: string;
  notes: string;
};

export type ChatMessage = { id: number; role: "madina" | "customer"; text: string };
