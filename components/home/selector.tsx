"use client";
import { useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Flame, IceCreamCone, Lightbulb, Moon, Snowflake } from "lucide-react";
import { HomeLeadForm } from "./home-lead-form";
const icons = { fruit: Flame, moon: Moon, meat: Lightbulb, ice: IceCreamCone, snow: Snowflake, case: BriefcaseBusiness };
type SelectorContent = { eyebrow: string; title: string; description: string; items: { id: string; title: string; icon: string; isVisible: boolean; order: number }[] };
export function Selector({ content }: { content: SelectorContent }) {
  const items = useMemo(() => content.items.filter((item) => item.isVisible).sort((a, b) => a.order - b.order), [content.items]);
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const [step, setStep] = useState(1);
  const selectedItem = items.find((item) => item.id === selected);
  return <section className="selector-section" id="tanlov"><div className="container">
    <div className="selector-intro"><p className="eyebrow">{content.eyebrow}</p><h2>{content.title}</h2><p>{content.description}</p></div>
    <ol className="wizard-progress" aria-label="So‘rov bosqichlari">{["Mahsulot turi", "Harorat va hajm", "Aloqa"].map((label, index) => <li className={step >= index + 1 ? "is-active" : ""} key={label}><b>{index + 1}</b><span>{label}</span></li>)}</ol>
    {step === 1 && <><div className="type-grid" role="group" aria-label="Mahsulot turi">{items.map((item) => { const Icon = icons[item.icon as keyof typeof icons] ?? BriefcaseBusiness; return <button className={`type-card ${selected === item.id ? "selected" : ""}`} key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><span className="type-icon"><Icon size={22} strokeWidth={1.8} /></span><span>{item.title}</span></button>; })}</div><button className="button button-blue wizard-next" type="button" disabled={!selectedItem} onClick={() => setStep(2)}>Davom etish <ArrowRight size={17} /></button></>}
    {step === 2 && <div className="wizard-info"><h3>{selectedItem?.title}</h3><p>Kerakli harorat va xona hajmi yoki saqlash tonnasini keyingi shaklda kiriting. Hajm tonnaga avtomatik aylantirilmaydi.</p><div><button type="button" className="button button-outline" onClick={() => setStep(1)}>Orqaga</button><button type="button" className="button button-blue" onClick={() => setStep(3)}>Aloqa ma’lumotlari <ArrowRight size={17} /></button></div></div>}
    {step === 3 && <div className="wizard-form"><button type="button" className="wizard-back" onClick={() => setStep(2)}>← Orqaga</button><HomeLeadForm compact initialProduct={selectedItem?.title || ""} /></div>}
  </div></section>;
}
