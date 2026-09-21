import type { Metadata } from "next";
import { ExchangeRateSettings } from "@/components/admin/exchange-rate-settings";
import { getUsdUzsRate } from "@/lib/currency/cbu";
export const metadata:Metadata={title:"Sozlamalar — Admin | BUYUK KARAVAN"};
export default async function Page(){return <ExchangeRateSettings rate={await getUsdUzsRate()}/>;}
