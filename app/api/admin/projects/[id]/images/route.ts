import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { completeProjectImageUpload, createProjectImageUpload, ProjectImageError } from "@/lib/projects/storage";

export const runtime = "nodejs";

type UploadRequest = { action?: unknown; type?: unknown; size?: unknown; key?: unknown };

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  await requireAdmin();
  const {id}=await params;
  const project=await getDb().project.findUnique({where:{id},select:{id:true}});
  if(!project)return Response.json({error:"Loyiha topilmadi."},{status:404});
  let body:UploadRequest;
  try{body=await request.json() as UploadRequest;}catch{return Response.json({error:"So'rov noto'g'ri."},{status:400});}
  if(typeof body.type!=="string"||typeof body.size!=="number")return Response.json({error:"Rasm ma'lumoti noto'g'ri."},{status:400});
  try{
    if(body.action==="presign")return Response.json(await createProjectImageUpload(id,body.type,body.size));
    if(body.action==="complete"&&typeof body.key==="string")return Response.json({url:await completeProjectImageUpload(id,body.key,body.type,body.size)});
    return Response.json({error:"So'rov noto'g'ri."},{status:400});
  }catch(error){return Response.json({error:error instanceof ProjectImageError?error.message:"Rasmni yuklab bo'lmadi."},{status:400});}
}
