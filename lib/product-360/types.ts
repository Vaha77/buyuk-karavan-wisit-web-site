export type Product360CaptureCount = 12 | 24;
export type Product360Slot = `real-${Product360CaptureCount}-${string}`;
export type Product360Sources = Partial<Record<Product360Slot, string>>;
export type Product360View = { id: string; productId: string; status: "DRAFT" | "PROCESSING" | "READY" | "FAILED"; sourceImages: Product360Sources; frames: string[]; frameCount: number; posterImage?: string };

export function readProduct360Sources(value: unknown): Product360Sources {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const sources = Object.fromEntries(Object.entries(record).filter(([key,url])=>/^real-(12|24)-\d{3}$/.test(key)&&typeof url==="string")) as Product360Sources;
  for(const [key,url] of Object.entries(record)){if(/^frame-\d{3}$/.test(key)&&typeof url==="string")sources[`real-12-${key.slice(-3)}` as Product360Slot]=url;}
  const legacy={front:"real-12-001",right:"real-12-004",back:"real-12-007",left:"real-12-010"} as const;
  for(const [oldKey,newKey] of Object.entries(legacy))if(!sources[newKey]&&typeof record[oldKey]==="string")sources[newKey]=record[oldKey] as string;
  return sources;
}

export function product360CaptureSlots(count:Product360CaptureCount){return Array.from({length:count},(_,index)=>({slot:`real-${count}-${String(index+1).padStart(3,"0")}` as Product360Slot,angle:index*(360/count),position:index+1}));}
