import "server-only";
import { getDb } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { mapProject } from "./mapper";
const orderBy = [{ isFeatured: "desc" as const }, { order: "asc" as const }, { createdAt: "desc" as const }];
const loadHomeProjects=unstable_cache(async()=>(await getDb().project.findMany({where:{isVisible:true},orderBy,take:3})).map(mapProject),["home-projects-v2"],{revalidate:300,tags:["public-projects"]});
const loadProjectBySlug=unstable_cache(async(slug:string)=>{const row=await getDb().project.findFirst({where:{slug,isVisible:true}});return row?mapProject(row):null;},["project-detail-v2"],{revalidate:300,tags:["public-projects"]});
export async function getHomeProjects() { return loadHomeProjects(); }
export async function getProjectBySlug(slug: string) { return loadProjectBySlug(slug); }
export async function getAdminProjects() { return (await getDb().project.findMany({ orderBy })).map(mapProject); }
export async function getAdminProjectById(id: string) { const row = await getDb().project.findUnique({ where: { id } }); return row ? mapProject(row) : null; }
