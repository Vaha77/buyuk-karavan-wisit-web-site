import "server-only";
import { getDb } from "@/lib/db";
import { mapProject } from "./mapper";
const orderBy = [{ isFeatured: "desc" as const }, { order: "asc" as const }, { createdAt: "desc" as const }];
export async function getHomeProjects() { return (await getDb().project.findMany({ where: { isVisible: true }, orderBy, take: 3 })).map(mapProject); }
export async function getProjectBySlug(slug: string) { const row = await getDb().project.findFirst({ where: { slug, isVisible: true } }); return row ? mapProject(row) : null; }
export async function getAdminProjects() { return (await getDb().project.findMany({ orderBy })).map(mapProject); }
export async function getAdminProjectById(id: string) { const row = await getDb().project.findUnique({ where: { id } }); return row ? mapProject(row) : null; }
