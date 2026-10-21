import { ArrowRight, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { HomeContent } from "@/data/admin-home";
import { StatCounter } from "@/components/ui/aurora";
import { isPublicNeonImage } from "@/lib/products/image-delivery";
import "./hero.css";

const blade = "M0-6C10-30 34-34 40-22C30-16 16-10 4 2Z";
function Fan({ defs = false }: { defs?: boolean }) {
  return <svg className="hero-fan" viewBox="-50 -50 100 100" aria-hidden="true">
    {defs && <defs><linearGradient id="hero-blade" x1="0" x2="1"><stop stopColor="#5b6178"/><stop offset="1" stopColor="#9aa1bb"/></linearGradient><radialGradient id="hero-hub"><stop stopColor="#cfd4e6"/><stop offset="1" stopColor="#4a4f63"/></radialGradient></defs>}
    <circle r="47" fill="#0c0d13" stroke="#3b3f52" strokeWidth="2"/>
    <g className="hero-fan-rot">{[0, 72, 144, 216, 288].map(angle => <path key={angle} d={blade} transform={`rotate(${angle})`} fill="url(#hero-blade)"/>)}</g>
    <circle r="8" fill="url(#hero-hub)"/>
    <g fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1.2"><circle r="44"/><circle r="34"/><circle r="24"/><path d="M-47 0H47M0-47V47"/></g>
  </svg>;
}

/** First word of the second headline line (or of the only line) gets the gradient. */
function Headline({ text }: { text: string }) {
  const lines = text.split("\n"), marked = lines.length > 1 ? 1 : 0;
  return <h1>{lines.map((line, index) => {
    const [word, ...rest] = line.split(/(?=[,\s])/);
    return <span className="hero-line" key={index}>{index === marked ? <><em className="g-text">{word}</em>{rest.join("")}</> : line}</span>;
  })}</h1>;
}

export function Hero({ content, productCount }: { content: HomeContent["hero"]; productCount: number }) {
  return <section className="hero">
    {content.image && <Image className="hero-bg" src={content.image} alt="" fill priority sizes="100vw" unoptimized={isPublicNeonImage(content.image)}/>}
    <div className="container hero-layout">
      <div className="hero-copy">
        <span className="hero-badge"><b>Yangi</b>{content.eyebrow}</span>
        <Headline text={content.headline}/>
        <p className="hero-subtitle">{content.subtitle}</p>
        <form className="hero-search glass" action="/products" role="search">
          <Search size={18} aria-hidden="true"/>
          <input type="search" name="q" placeholder="Masalan: Bitzer 15 HP, FN120, glazok F16…" aria-label="Mahsulot qidirish" maxLength={120}/>
          <button className="btn-g" type="submit">Qidirish</button>
        </form>
        <div className="hero-actions"><Link href="/products" className="btn-g btn-lg">{content.primaryButton} <ArrowRight size={16} aria-hidden="true"/></Link><a href="#loyihalar" className="btn-ghost btn-lg">{content.secondaryButton}</a></div>
        <div className="hero-trust rv">
          <div><StatCounter value={productCount} suffix="+"/><span>mahsulot</span></div>
          <div><StatCounter value={2}/><span>filial</span></div>
          <div><StatCounter value={14}/><span>viloyat</span></div>
        </div>
      </div>
      <div className="hero-orb" aria-hidden="true">
        <i className="hero-ring hero-ring-1"/><i className="hero-ring hero-ring-2"/><i className="hero-ring hero-ring-3"/>
        <div className="hero-unit"><Fan defs/><Fan/></div>
        <div className="hero-float glass-blur" style={{ left: 0, top: 60 }}><span>Harorat diapazoni</span><b className="hero-cold">{content.minimum} → {content.maximum}</b></div>
        <div className="hero-float glass-blur" style={{ right: 0, top: 30, animationDelay: "-2s" }}><span>Seh</span><b>O‘z ishlab chiqarish</b></div>
        <div className="hero-float glass-blur" style={{ left: 50, bottom: 40, animationDelay: "-4s" }}><span>Kafolat</span><b className="hero-ok">✓ bor</b></div>
      </div>
    </div>
  </section>;
}
