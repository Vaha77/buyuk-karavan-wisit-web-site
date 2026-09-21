import "server-only";
import { getDb } from "@/lib/db";

export async function marjaBalance(agentId:string,db=getDb()){const result=await db.marjaTransaction.aggregate({where:{agentId},_sum:{amount:true}});return result._sum.amount||0;}
export async function marjaStats(agentId:string){const rows=await getDb().marjaTransaction.groupBy({by:["type"],where:{agentId},_sum:{amount:true}});const value=(type:string)=>rows.find(row=>row.type===type)?._sum.amount||0;return{balance:rows.reduce((sum,row)=>sum+(row._sum.amount||0),0),earned:value("SALE_EARNED"),spent:Math.abs(value("REWARD_SPENT"))};}
