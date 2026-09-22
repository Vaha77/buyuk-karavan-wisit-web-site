import "server-only";
import type { AdminUser,Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

type Actor=Pick<AdminUser,"id"|"name">;
type AuditInput={action:string;entityType:string;entityId:string;entityName?:string|null;summary:string;before?:Record<string,unknown>|null;after?:Record<string,unknown>|null;metadata?:Record<string,unknown>|null};

const clean=(value:Record<string,unknown>|null|undefined):Prisma.InputJsonValue|undefined=>value?JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue:undefined;
export async function writeAudit(actor:Actor,input:AuditInput){return getDb().auditLog.create({data:{actorAdminId:actor.id,actorNameSnapshot:actor.name,action:input.action,entityType:input.entityType,entityId:input.entityId,entityName:input.entityName||null,summary:input.summary,before:clean(input.before),after:clean(input.after),metadata:clean(input.metadata)}});}

export function productSnapshot(row:{name:string;brand:string;model:string;slug:string;categoryId:string;priceUsd:{toString():string}|null;images:string[];availability:string;isVisible:boolean;seoTitle:string|null;seoDescription:string|null;description:string|null;shortDescription:string|null}){return{name:row.name,brand:row.brand,model:row.model,slug:row.slug,categoryId:row.categoryId,priceUsd:row.priceUsd?.toString()||null,imageCount:row.images.length,images:row.images,availability:row.availability,isVisible:row.isVisible,seoTitle:row.seoTitle,seoDescription:row.seoDescription,description:row.description,shortDescription:row.shortDescription};}
