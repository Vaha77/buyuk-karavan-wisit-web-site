"use server";
import { headers } from "next/headers";
import { createLead } from "@/lib/leads/service";
const attempts=new Map<string,{count:number;start:number}>();
export async function submitLeadAction(input:unknown){const h=await headers(),key=(h.get("x-forwarded-for")||h.get("x-real-ip")||"local").split(",")[0].trim(),now=Date.now(),entry=attempts.get(key);if(!entry||now-entry.start>15*60_000)attempts.set(key,{count:1,start:now});else if(entry.count>=5)return{ok:false as const,error:"Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring."};else entry.count++;return createLead(input);}
