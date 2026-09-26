"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { calculationSchema } from "@/lib/calculations/validation";

export async function saveCalculationAction(id:string|null,raw:unknown):Promise<{id?:string;error?:string}>{
  const actor=await requireAdmin(),parsed=calculationSchema.safeParse(raw);
  if(!parsed.success)return{error:parsed.error.issues[0]?.message||"Hisob-kitob ma'lumotlarini tekshiring."};
  const input=parsed.data,header={customerName:input.customerName,phone:input.phone||null,region:input.region||null,projectName:input.projectName,capacityTons:input.capacityTons||null,cameraCount:input.cameraCount,temperatureMin:input.temperatureMin,temperatureMax:input.temperatureMax,notes:input.notes||null,buildingWidth:input.buildingWidth,buildingLength:input.buildingLength,buildingHeight:input.buildingHeight,status:input.status};
  const rooms=input.rooms.map((room,order)=>({id:room.id,name:room.name,type:room.type,x:room.x,y:room.y,width:room.width,length:room.length,height:room.type==="ROOM"?room.height:null,capacityTons:room.type==="ROOM"?room.capacityTons:null,temperatureMin:room.type==="ROOM"?room.temperatureMin:null,temperatureMax:room.type==="ROOM"?room.temperatureMax:null,doorEnabled:room.type==="ROOM"&&room.doorEnabled,doorSide:room.type==="ROOM"&&room.doorEnabled?room.doorSide:null,order}));
  try{
    let row;
    if(id){const exists=await getDb().calculation.findUnique({where:{id},select:{id:true}});if(!exists)return{error:"Hisob-kitob topilmadi."};row=await getDb().$transaction(async tx=>{await tx.calculationRoom.deleteMany({where:{calculationId:id}});await tx.calculationRoom.createMany({data:rooms.map(room=>({...room,calculationId:id}))});return tx.calculation.update({where:{id},data:header});});}
    else row=await getDb().calculation.create({data:{...header,createdByAdminId:actor.id,rooms:{create:rooms}}});
    await writeAudit(actor,{action:id?"UPDATE":"CREATE",entityType:"CALCULATION",entityId:row.id,entityName:row.projectName,summary:id?"Hisob-kitob qoralamasini yangiladi":"Hisob-kitob qoralamasini yaratdi",after:{customerName:row.customerName,projectName:row.projectName,status:row.status,roomCount:rooms.length}});
    revalidatePath("/admin/calculations");revalidatePath(`/admin/calculations/${row.id}`);return{id:row.id};
  }catch{return{error:"Hisob-kitobni saqlab bo'lmadi."};}
}
