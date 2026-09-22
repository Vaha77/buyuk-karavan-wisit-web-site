"use server";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { createLead, findLeadSubmission } from "@/lib/leads/service";

const attempts = new Map<string,{count:number;start:number;submissions:Set<string>}>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function inputField(input:unknown,key:"idempotencyKey"|"clientToken") {
  if (!input || typeof input !== "object" || !(key in input)) return "";
  const value = (input as Record<string,unknown>)[key];
  return typeof value === "string" ? value.trim().slice(0,100) : "";
}

function trustedClientIp(h:Awaited<ReturnType<typeof headers>>) {
  let candidate = "";
  if (process.env.VERCEL === "1") candidate = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  else if (process.env.CF_PAGES || process.env.CF_WORKER) candidate = h.get("cf-connecting-ip")?.trim() || "";
  else if (process.env.TRUST_PROXY === "1") candidate = h.get("x-real-ip")?.trim() || "";
  return isIP(candidate) ? candidate : "unknown";
}

function limited(key:string,now:number,submissionKey:string) {
  const entry = attempts.get(key);
  if (!entry || now-entry.start>WINDOW_MS) { attempts.set(key,{count:1,start:now,submissions:new Set(submissionKey?[submissionKey]:[])}); return false; }
  if (submissionKey&&entry.submissions.has(submissionKey)) return false;
  if (entry.count>=MAX_ATTEMPTS) return true;
  entry.count += 1;
  if(submissionKey)entry.submissions.add(submissionKey);
  return false;
}

export async function submitLeadAction(input:unknown) {
  const idempotencyKey = inputField(input,"idempotencyKey");
  if (idempotencyKey) {
    const existing = await findLeadSubmission(idempotencyKey);
    if (existing) return {ok:true as const,id:existing.id,duplicate:true as const};
  }

  if (process.env.NODE_ENV === "production") {
    const h = await headers();
    const clientToken = inputField(input,"clientToken");
    const fingerprint = [trustedClientIp(h),h.get("user-agent")||"unknown",clientToken||"anonymous"].join("|");
    const key = createHash("sha256").update(fingerprint).digest("hex");
    if (limited(key,Date.now(),idempotencyKey)) return {ok:false as const,error:"Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring."};
  }

  if (input && typeof input === "object" && (input as Record<string,unknown>).source === "PRODUCT_CONSULTATION") {
    const candidate = input as Record<string,unknown>;
    const productId = typeof candidate.productId === "string" ? candidate.productId.trim() : "";
    const productSlug = typeof candidate.productSlug === "string" ? candidate.productSlug.trim() : "";
    const product = productId && productSlug ? await getDb().product.findFirst({
      where:{ id:productId, slug:productSlug, isVisible:true, category:{isActive:true} },
      select:{ id:true, slug:true, name:true, model:true },
    }) : null;
    if (!product) return {ok:false as const,error:"Mahsulot topilmadi. Sahifani yangilab, qayta urinib ko‘ring."};
    return createLead({
      ...candidate,
      source:"PRODUCT_CONSULTATION",
      requestType:"Mahsulot bo‘yicha maslahat",
      product:[product.name,product.model].filter(Boolean).join(" "),
      productId:product.id,
      productSlug:product.slug,
    });
  }

  return createLead(input);
}
