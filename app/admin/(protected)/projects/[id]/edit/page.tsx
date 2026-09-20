import { notFound } from "next/navigation";import { ProjectForm } from "@/components/admin/project-form";import { getAdminProjectById } from "@/lib/projects/queries";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const project=await getAdminProjectById(id);if(!project)notFound();return <ProjectForm project={project}/>;}
