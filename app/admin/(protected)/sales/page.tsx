import {getDb} from "@/lib/db";import {requireAdmin} from "@/lib/auth/require-admin";import {SalesBoard} from "@/components/admin/sales-board";
export default async function SalesPage(){await requireAdmin();const sales=await getDb().sale.findMany({orderBy:{reportedAt:"desc"},include:{agent:true}});return <SalesBoard sales={sales}/>}
