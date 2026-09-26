import { z } from "zod";
import { geometryWarnings } from "./geometry";

const finitePositive=z.number().finite().positive().max(1000);
const optionalMeasure=z.number().finite().min(-100).max(1000);
const roomSchema=z.object({
  id:z.string().uuid(),name:z.string().trim().min(1).max(80),type:z.enum(["ROOM","CORRIDOR"]),x:z.number().finite().min(0).max(1000),y:z.number().finite().min(0).max(1000),
  width:finitePositive,length:finitePositive,height:z.number().finite().min(0).max(100),capacityTons:z.number().finite().min(0).max(100000),temperatureMin:optionalMeasure,temperatureMax:optionalMeasure,
  doorEnabled:z.boolean(),doorSide:z.enum(["TOP","BOTTOM","LEFT","RIGHT"]),order:z.number().int().min(0).max(999),
});
export const calculationSchema=z.object({
  customerName:z.string().trim().min(1,"Mijoz nomini kiriting.").max(160),phone:z.string().trim().max(40),region:z.string().trim().max(160),projectName:z.string().trim().min(1,"Loyiha nomini kiriting.").max(200),
  capacityTons:z.number().finite().min(0).max(100000),cameraCount:z.number().int().min(0).max(100),temperatureMin:optionalMeasure,temperatureMax:optionalMeasure,notes:z.string().trim().max(4000),
  buildingWidth:finitePositive,buildingLength:finitePositive,buildingHeight:finitePositive,status:z.enum(["DRAFT","READY"]),rooms:z.array(roomSchema).max(100),
}).superRefine((value,ctx)=>{
  if(new Set(value.rooms.map(room=>room.id)).size!==value.rooms.length)ctx.addIssue({code:"custom",path:["rooms"],message:"Kamera identifikatorlari takrorlanmasligi kerak."});
  const warnings=geometryWarnings(value.rooms,value.buildingWidth,value.buildingLength);
  if(warnings.outside)ctx.addIssue({code:"custom",path:["rooms"],message:"Kamera bino chegarasidan tashqariga chiqdi."});
  if(warnings.overlap)ctx.addIssue({code:"custom",path:["rooms"],message:"Kameralar bir-birining ustiga tushib qolgan."});
});
export type CalculationInput=z.infer<typeof calculationSchema>;
