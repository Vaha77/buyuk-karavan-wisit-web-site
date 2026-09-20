import { HomePage } from "@/components/home/home-page";
import { getPublicHomeContent } from "@/lib/home/content";
import { getPublicProducts } from "@/lib/products/queries";
export default async function Home() { const [content,products]=await Promise.all([getPublicHomeContent(),getPublicProducts().catch(()=>[])]); return <HomePage content={content} products={products}/>; }
