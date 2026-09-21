import "server-only";
import OpenAI, { APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { normalizeSlug } from "./validation";

const outputSchema=z.object({brand:z.string().nullable(),model:z.string().nullable(),categoryId:z.string().nullable(),shortDescription:z.string().nullable(),description:z.string().nullable(),tags:z.array(z.string()).max(8),slug:z.string().nullable(),seoTitle:z.string().nullable(),seoDescription:z.string().nullable()});
export type ProductAutofillSuggestions=z.infer<typeof outputSchema>;
type Input={productId:string|null;name:string;brand:string;model:string;categoryId:string;shortDescription:string;description:string;specifications:Array<{name:string;value:string}>;tags:string[];slug:string;seoTitle:string;seoDescription:string};

function trim(value:string|null,max:number){const cleaned=value?.trim();return cleaned?cleaned.slice(0,max):null;}
async function uniqueSlug(raw:string,productId:string|null){const base=normalizeSlug(raw).slice(0,150)||"mahsulot";for(let index=0;index<100;index++){const slug=index?`${base}-${index+1}`:base;const exists=await getDb().product.findFirst({where:{slug,...(productId?{id:{not:productId}}:{})},select:{id:true}});if(!exists)return slug;}return null;}

export async function generateProductAutofill(input:Input):Promise<ProductAutofillSuggestions>{
  if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_NOT_CONFIGURED");
  const categories=await getDb().productCategory.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:[{order:"asc"},{name:"asc"}]});
  const model=process.env.OPENAI_PRODUCT_TEXT_MODEL?.trim()||"gpt-4.1-mini";
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60_000,maxRetries:1});
  const facts={name:input.name,brand:input.brand||null,model:input.model||null,currentCategoryId:input.categoryId||null,shortDescription:input.shortDescription||null,description:input.description||null,specifications:input.specifications.filter(item=>item.name.trim()&&item.value.trim()),tags:input.tags,slug:input.slug||null,seoTitle:input.seoTitle||null,seoDescription:input.seoDescription||null,activeCategories:categories};
  try{
    const response=await client.responses.parse({model,input:[{role:"system",content:"You prepare concise Uzbek product catalog copy for BUYUK KARAVAN refrigeration equipment. Return suggestions only. Never invent or infer technical numbers, power, capacity, temperature, refrigerant, voltage, dimensions, performance, certification, warranty, origin, or compatibility. Use technical facts only when explicitly present in the supplied admin data. Preserve factual meaning. Short description: 1-2 short sentences explaining what it is, use, and practical value. Description: a strong short opening, brief explanation, then 3-5 concise bullet lines beginning with • when supported, and a short contextual CTA. Avoid generic hype. Suggest categoryId only from activeCategories and only with a strong semantic match; otherwise null. Do not create categories. Use null when brand/model is uncertain. SEO must be concise, natural, and factual."},{role:"user",content:JSON.stringify(facts)}],text:{format:zodTextFormat(outputSchema,"product_autofill")},store:false});
    const parsed=response.output_parsed;if(!parsed)throw new Error("EMPTY_AI_OUTPUT");
    const allowed=new Set(categories.map(category=>category.id));
    return {brand:trim(parsed.brand,120),model:trim(parsed.model,120),categoryId:parsed.categoryId&&allowed.has(parsed.categoryId)?parsed.categoryId:null,shortDescription:trim(parsed.shortDescription,500),description:trim(parsed.description,10000),tags:parsed.tags.map(tag=>tag.trim().slice(0,80)).filter(Boolean).slice(0,8),slug:input.slug?null:await uniqueSlug(parsed.slug||`${input.brand} ${input.name} ${input.model}`,input.productId),seoTitle:trim(parsed.seoTitle,160),seoDescription:trim(parsed.seoDescription,500)};
  }catch(error){if(error instanceof APIError)console.error("Product autofill OpenAI error",{status:error.status,code:error.code,type:error.type,message:error.message,model});throw error;}
}
