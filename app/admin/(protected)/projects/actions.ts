"use server";
import { redirect } from "next/navigation";
import { createProject, deleteProject, ProjectNotFoundError, ProjectSlugError, toggleProjectVisibility, updateProject, type ProjectImageInput } from "@/lib/projects/mutations";
import { ProjectImageError } from "@/lib/projects/storage";
import { projectSchema } from "@/lib/projects/validation";
export async function saveProjectAction(id:string|null,input:unknown,images:ProjectImageInput[]){const parsed=projectSchema.safeParse(input);if(!parsed.success)return{error:parsed.error.issues[0]?.message||"Ma'lumotlarni tekshiring."};try{if(id)await updateProject(id,parsed.data,images);else await createProject(parsed.data,images);}catch(e){if(e instanceof ProjectSlugError)return{error:"Bu slug band."};if(e instanceof ProjectImageError)return{error:e.message};return{error:"Loyihani saqlab bo'lmadi."};}redirect(`/admin/projects?saved=${id?"updated":"created"}`);}
export async function deleteProjectAction(id:string){try{await deleteProject(id);return{};}catch(e){return{error:e instanceof ProjectNotFoundError?"Loyiha topilmadi.":"Loyihani o'chirib bo'lmadi."};}}
export async function toggleProjectVisibilityAction(id:string){try{await toggleProjectVisibility(id);return{};}catch{return{error:"Holatni yangilab bo'lmadi."};}}
