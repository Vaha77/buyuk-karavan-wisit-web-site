import { notFound } from "next/navigation";
import { CalculationWorkspace } from "@/components/admin/calculation-workspace";
import { getCalculation } from "@/lib/calculations/queries";
import "@/components/admin/calculation-planner.css";
export default async function CalculationPage({params}:{params:Promise<{id:string}>}){const {id}=await params,row=await getCalculation(id);if(!row)notFound();return <CalculationWorkspace initial={row}/>;}
