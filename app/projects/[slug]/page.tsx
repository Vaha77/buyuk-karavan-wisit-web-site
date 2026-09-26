import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { getProjectBySlug } from "@/lib/projects/queries";
import { isPublicNeonImage } from "@/lib/products/image-delivery";
import { versionProjectImageUrl } from "@/lib/projects/image-delivery";
import "./project.css";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return {};
  return { title: `${project.title} | Buyuk Karavan`, description: project.shortDescription || project.description.slice(0, 160), openGraph: project.coverImage ? { images: [project.coverImage] } : undefined };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const facts = [["Manzil", project.location], ["Harorat", project.temperature], ["Quvvat / sig'im", project.capacity], ["Kategoriya", project.category]].filter((item): item is [string, string] => Boolean(item[1]));
  const coverUrl=versionProjectImageUrl(project.coverImage,project.updatedAt);
  return <><Header/><main className="project-detail-page"><div className="container"><nav className="project-breadcrumb"><Link href="/">Bosh sahifa</Link><span>›</span><strong>{project.title}</strong></nav><section className="project-detail-hero"><div><span className="eyebrow">AMALGA OSHIRILGAN LOYIHA</span><h1>{project.title}</h1>{project.shortDescription&&<p>{project.shortDescription}</p>}</div>{coverUrl&&<Image unoptimized={isPublicNeonImage(coverUrl)} src={coverUrl} alt={project.title} width={1200} height={760} sizes="(max-width: 700px) calc(100vw - 40px), 1200px" priority/>}</section>{facts.length>0&&<section className="project-facts">{facts.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>}{project.description&&<section className="project-copy"><h2>Loyiha haqida</h2><p>{project.description}</p></section>}{project.images.length>1&&<section className="project-gallery"><h2>Loyiha rasmlari</h2><div>{project.images.slice(1).map((src,index)=>{const imageUrl=versionProjectImageUrl(src,project.updatedAt);return <Image unoptimized={isPublicNeonImage(imageUrl)} key={src} src={imageUrl} alt={`${project.title} — ${index+2}`} width={800} height={560} sizes="(max-width: 700px) calc(100vw - 40px), 600px"/>})}</div></section>}<section className="project-cta"><h2>Shunday loyiha kerakmi?</h2><p>Mutaxassislarimiz talablaringizga mos sovutish yechimini hisoblab beradi.</p><a href="#aloqa">Maslahat olish</a></section></div></main><Footer onProducts/></>;
}
