import { ArrowDown, ArrowRight, Mouse } from "lucide-react";
import Link from "next/link";
import type { HomeContent } from "@/data/admin-home";
import { HeroStage } from "./hero-stage";
import "./hero.css";

function HeroContourLight() {
  return <>
    <svg className="hero-contour-light hero-contour-desktop" viewBox="0 0 580 580" aria-hidden="true">
      <defs><radialGradient id="hero-ice-glow"><stop stopColor="#d9f8ff" stopOpacity=".8"/><stop offset=".28" stopColor="#99e9ff" stopOpacity=".38"/><stop offset="1" stopColor="#99e9ff" stopOpacity="0"/></radialGradient></defs>
      <path id="hero-contour-desktop-path" d="M155 120 H425 Q460 120 460 155 V425 Q460 460 425 460 H155 Q120 460 120 425 V155 Q120 120 155 120 Z" fill="none"/>
      <g className="hero-contour-trail"><circle r="19" fill="url(#hero-ice-glow)"/></g>
      <g className="hero-contour-beacon"><circle r="30" fill="url(#hero-ice-glow)"/><circle r="3" fill="#d9f8ff"/></g>
    </svg>
    <svg className="hero-contour-light hero-contour-mobile" viewBox="0 0 350 300" aria-hidden="true">
      <defs><radialGradient id="hero-ice-glow-mobile"><stop stopColor="#d9f8ff" stopOpacity=".7"/><stop offset=".32" stopColor="#99e9ff" stopOpacity=".3"/><stop offset="1" stopColor="#99e9ff" stopOpacity="0"/></radialGradient></defs>
      <path id="hero-contour-mobile-path" d="M35 1 H315 Q349 1 349 35 V265 Q349 299 315 299 H35 Q1 299 1 265 V35 Q1 1 35 1 Z" fill="none"/>
      <g className="hero-contour-beacon"><circle r="22" fill="url(#hero-ice-glow-mobile)"/><circle r="2.5" fill="#d9f8ff"/></g>
    </svg>
  </>;
}

const crates = [{ x: 4, y: 104 }, { x: 166, y: 104 }, { x: 85, y: 14 }];
const fruits = [112, 136, 160, 184, 208];

/** Line-art fruit crates stacked inside the chamber — the nearest parallax layer. */
function FruitCrates() {
  return <svg className="hero-crates" data-depth="-0.06" viewBox="0 0 320 200" aria-hidden="true">
    {fruits.map(cx => <circle key={cx} cx={cx} cy={14} r={10}/>)}
    {crates.map(({ x, y }) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      <rect width="150" height="88" rx="5"/>
      <line x1="0" y1="29" x2="150" y2="29"/><line x1="0" y1="59" x2="150" y2="59"/>
      <rect className="hero-crate-handle" x="57" y="10" width="36" height="9" rx="4.5"/>
    </g>)}
  </svg>;
}

export function Hero({ content }: { content: HomeContent["hero"] }) {
  const lines = content.headline.split("\n");
  return <HeroStage style={content.image ? { backgroundImage: `linear-gradient(#092741c7,#092741c7),url(${content.image})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
    <div className="hero-grid" data-depth="0.32" aria-hidden="true"/>
    <div className="hero-fog hero-fog-back" data-depth="0.24" aria-hidden="true"/>
    <div className="hero-room room-back" data-depth="0.22" aria-hidden="true"/>
    <div className="hero-room room-front" data-depth="0.12" aria-hidden="true"><HeroContourLight/></div>
    <FruitCrates/>
    <div className="container hero-content" data-depth="0.16">
      <div className="hero-copy">
        <p className="eyebrow hero-eyebrow">{content.eyebrow}</p>
        <h1><span className="hero-title-desktop">{lines.map((line, index) => <span key={index}>{line}{index < lines.length - 1 && <br/>}</span>)}</span><span className="hero-title-mobile">{lines.map((line, index) => <span className="hero-title-line" key={index}>{line}</span>)}</span></h1>
        <p className="hero-subtitle">{content.subtitle}</p>
        <div className="hero-actions"><Link href="/products" className="button button-white">{content.primaryButton} <ArrowRight size={16} aria-hidden="true"/></Link><a href="#loyihalar" className="button button-outline-light">{content.secondaryButton}</a></div>
      </div>
      <div className="hero-temp"><small>Harorat diapazoni</small><strong>{content.minimum} <span>→</span> {content.maximum}</strong><i/></div>
      <div className="hero-scroll"><Mouse size={19}/><span>Pastga aylantiring</span><ArrowDown size={13}/></div>
    </div>
    <div className="hero-fog hero-fog-front" data-depth="-0.2" aria-hidden="true"/>
  </HeroStage>;
}
