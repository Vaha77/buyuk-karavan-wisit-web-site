import "server-only";import type {AdminUser} from "@/generated/prisma/client";import {getDb} from "@/lib/db";import {writeAudit} from "./service";
type Actor=Pick<AdminUser,"id"|"name">;
export async function recordPhotoStudioCreation(actor:Actor,mode:string,width:number,height:number){const asset=await getDb().photoStudioAsset.create({data:{mode,creatorAdminId:actor.id}});await writeAudit(actor,{action:"IMAGE_CREATE",entityType:"PHOTO_STUDIO_ASSET",entityId:asset.id,entityName:`Photo Studio ${mode}`,summary:"Photo Studio orqali rasm yaratdi",after:{mode,width,height}});return asset;}
export async function recordPhotoStudioAttachment(actor:Actor,assetId:string,product:{id:string;name:string},placement:"main"|"gallery"){
  const asset=await getDb().photoStudioAsset.findUnique({where:{id:assetId},select:{id:true,creatorAdminId:true,attachedAt:true}});
  if(!asset||asset.attachedAt)return null;
  const claimed=await getDb().photoStudioAsset.updateMany({where:{id:asset.id,attachedAt:null},data:{attachedProductId:product.id,attachedByAdminId:actor.id,attachedAt:new Date()}});
  if(claimed.count!==1)return null;
  try{await writeAudit(actor,{action:"IMAGE_ATTACH",entityType:"PHOTO_STUDIO_ASSET",entityId:asset.id,entityName:product.name,summary:`Rasmni ${product.name} mahsulotiga biriktirdi`,metadata:{productId:product.id,placement,creatorAdminId:asset.creatorAdminId}});}
  catch(error){console.error("[PhotoStudioAttach]",{stage:"audit_log",errorName:error instanceof Error?error.name:"UnknownError",errorMessage:error instanceof Error?error.message:"Unknown audit error"});}
  return asset;
}
