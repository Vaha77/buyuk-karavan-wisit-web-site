"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { generateProductAutofill, type ProductAutofillSuggestions } from "@/lib/products/ai-autofill";

const inputSchema=z.object({productId:z.string().nullable(),name:z.string().trim().min(1).max(120),brand:z.string().max(120),model:z.string().max(120),categoryId:z.string().max(100),shortDescription:z.string().max(500),description:z.string().max(10000),specifications:z.array(z.object({name:z.string().max(120),value:z.string().max(500)})).max(60),tags:z.array(z.string().max(80)).max(30),slug:z.string().max(160),seoTitle:z.string().max(160),seoDescription:z.string().max(500)});
export async function autofillProductAction(raw:unknown):Promise<{error?:string;suggestions?:ProductAutofillSuggestions}>{await requireAdmin();const parsed=inputSchema.safeParse(raw);if(!parsed.success)return{error:"Mahsulot ma’lumotlarini tekshiring."};try{return{suggestions:await generateProductAutofill(parsed.data)}}catch(error){if(error instanceof Error&&error.message==="OPENAI_NOT_CONFIGURED")return{error:"OpenAI API sozlanmagan."};return{error:"AI ma’lumot tayyorlay olmadi. Qayta urinib ko‘ring."};}}
