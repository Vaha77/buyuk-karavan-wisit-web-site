import { AdminProjectsPage } from "@/components/admin/admin-projects";import { getAdminProjects } from "@/lib/projects/queries";
export default async function Page({searchParams}:{searchParams:Promise<{saved?:string}>}){const [projects,params]=await Promise.all([getAdminProjects(),searchParams]);return <AdminProjectsPage projects={projects} saved={params.saved}/>;}
