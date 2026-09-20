import type { Project as DbProject } from "@/generated/prisma/client";
import type { Project } from "./types";
export function mapProject(row: DbProject): Project { return { ...row, shortDescription: row.shortDescription || "", description: row.description || "", location: row.location || "", temperature: row.temperature || "", capacity: row.capacity || "", category: row.category || "", coverImage: row.coverImage || row.images[0] || "", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
