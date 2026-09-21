import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db";

const CBU_URL="https://cbu.uz/uz/arkhiv-kursov-valyut/json/";
export type UsdUzsRate={rate:string;nominal:number;effectiveDate:string;lastSuccessfulSync:string;source:"CBU"};
type CbuRecord={Ccy?:unknown;Rate?:unknown;Nominal?:unknown;Date?:unknown};

function unitRate(rate:string,nominal:number){const [whole,fraction=""]=rate.split(".");const scale=BigInt(10)**BigInt(fraction.length);const scaled=BigInt(whole)*scale+BigInt(fraction||"0");const precision=BigInt(10000);const divided=(scaled*precision+BigInt(nominal)*scale/BigInt(2))/(BigInt(nominal)*scale);const integer=divided/precision,decimal=(divided%precision).toString().padStart(4,"0").replace(/0+$/,"");return decimal?`${integer}.${decimal}`:integer.toString();}
function parseCbuDate(value:string){const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);if(!match)return null;const date=new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);if(Number.isNaN(date.getTime())||date.getUTCFullYear()!==Number(match[3])||date.getUTCMonth()+1!==Number(match[2])||date.getUTCDate()!==Number(match[1]))return null;return date;}
export function parseOfficialUsdRate(payload:unknown,now=new Date()):UsdUzsRate|null{
  if(!Array.isArray(payload))return null;const usd=payload.find((item):item is CbuRecord=>!!item&&typeof item==="object"&&(item as CbuRecord).Ccy==="USD");if(!usd)return null;
  const rate=typeof usd.Rate==="string"?usd.Rate.trim():"",nominal=typeof usd.Nominal==="string"?Number(usd.Nominal):usd.Nominal;
  const effectiveDate=typeof usd.Date==="string"?parseCbuDate(usd.Date):null;
  if(!/^\d+(?:\.\d{1,6})?$/.test(rate)||Number(rate)<=0||!Number.isInteger(nominal)||Number(nominal)<=0||!effectiveDate)return null;
  return{rate:unitRate(rate,Number(nominal)),nominal:Number(nominal),effectiveDate:effectiveDate.toISOString(),lastSuccessfulSync:now.toISOString(),source:"CBU"};
}

export async function resolveUsdUzsRate(deps:{fetchOfficial:()=>Promise<unknown>;loadFallback:()=>Promise<UsdUzsRate|null>;persist:(rate:UsdUzsRate)=>Promise<void>;now?:()=>Date}):Promise<UsdUzsRate|null>{
  try{const rate=parseOfficialUsdRate(await deps.fetchOfficial(),deps.now?.()??new Date());if(!rate)throw new Error("INVALID_CBU_RATE");await deps.persist(rate);return rate;}catch{return deps.loadFallback();}
}
async function loadFallback():Promise<UsdUzsRate|null>{const row=await getDb().siteSettings.findUnique({where:{id:"global"}});if(row?.currencySource!=="CBU"||!row.cbuNominal||!row.cbuEffectiveDate||!row.cbuLastSyncedAt||row.usdToUzs.lte(0))return null;return{rate:row.usdToUzs.toString(),nominal:row.cbuNominal,effectiveDate:row.cbuEffectiveDate.toISOString(),lastSuccessfulSync:row.cbuLastSyncedAt.toISOString(),source:"CBU"};}
async function fetchAndPersist(){return resolveUsdUzsRate({fetchOfficial:async()=>{const response=await fetch(CBU_URL,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error("CBU_UNAVAILABLE");return response.json();},loadFallback,persist:async rate=>{await getDb().siteSettings.upsert({where:{id:"global"},create:{id:"global",usdToUzs:rate.rate,currencySource:"CBU",cbuNominal:rate.nominal,cbuEffectiveDate:new Date(rate.effectiveDate),cbuLastSyncedAt:new Date(rate.lastSuccessfulSync)},update:{usdToUzs:rate.rate,currencySource:"CBU",cbuNominal:rate.nominal,cbuEffectiveDate:new Date(rate.effectiveDate),cbuLastSyncedAt:new Date(rate.lastSuccessfulSync)}});}});}
const getCachedRate=unstable_cache(fetchAndPersist,["official-cbu-usd-uzs-rate"],{revalidate:3600,tags:["cbu-usd-rate"]});
export async function getUsdUzsRate():Promise<UsdUzsRate|null>{try{return await getCachedRate();}catch{return loadFallback();}}
