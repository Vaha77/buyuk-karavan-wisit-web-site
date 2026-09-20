import { HomePage } from "@/components/home/home-page";
import { getPublicHomeContent } from "@/lib/home/content";
import { getPublicProducts } from "@/lib/products/queries";
import { getHomeProjects } from "@/lib/projects/queries";
export default async function Home() { const [content,products,projects]=await Promise.all([getPublicHomeContent(),getPublicProducts().catch(()=>[]),getHomeProjects().catch(()=>[])]); return <HomePage content={content} products={products} projects={projects}/>; }
