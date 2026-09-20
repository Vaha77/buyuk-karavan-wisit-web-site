"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ImageIcon, Layers3, Lightbulb, RefreshCw, ScanLine, Snowflake, Sparkles, Type, WandSparkles } from "lucide-react";
import type { PhotoStudioMode } from "@/lib/photo-studio/types";

type Props = {
  mode: PhotoStudioMode;
  uploadedImageUrl: string;
  isGenerating: boolean;
  isSuccess: boolean;
  error: string;
  onRetry: () => void;
};

const stages = [
  { name: "Rasm tahlili", title: "Rasmingiz tahlil qilinmoqda...", helper: "Mahsulot shakli va muhim texnik elementlar aniqlanmoqda." },
  { name: "G‘oya va kompozitsiya", title: "Eng yaxshi vizual yo‘nalish tanlanmoqda...", helper: "Sizning mahsulotingiz uchun eng yaxshi kompozitsiya tanlanmoqda." },
  { name: "Sahna yaratish", title: "Professional fon va muhit yaratilmoqda...", helper: "Professional sovutish muhiti shakllantirilmoqda." },
  { name: "Mahsulotni joylashtirish", title: "Mahsulot kompozitsiyaga joylanmoqda...", helper: "Original ko‘rinish va texnik detallar himoyalanmoqda." },
  { name: "Yoritish va detallar", title: "Yoritish va detallar yaxshilanmoqda...", helper: "Premium yoritish va detallar moslashtirilmoqda." },
  { name: "Dizayn elementlari", title: "Dizayn elementlari tayyorlanmoqda...", helper: "Grafik va dizayn elementlari joylashtirilmoqda." },
  { name: "Yakuniy tekshiruv", title: "Yakuniy natija tekshirilmoqda...", helper: "Sifat va kompozitsiya nazorat qilinmoqda." },
  { name: "Tayyor", title: "Tayyor!", helper: "Sizning natijangiz muvaffaqiyatli yaratildi." },
] as const;

const modeTitles: Record<PhotoStudioMode, string> = {
  card: "Mahsulot kartasi tayyorlanmoqda...",
  detail: "Mahsulot sahifasi tayyorlanmoqda...",
  project: "Loyiha rasmi tayyorlanmoqda...",
  transparent: "Transparent PNG tayyorlanmoqda...",
  ad: "Reklama kreativi tayyorlanmoqda...",
};

function stageFor(progress: number) {
  if (progress >= 100) return 7;
  if (progress >= 90) return 6;
  if (progress >= 82) return 5;
  if (progress >= 68) return 4;
  if (progress >= 45) return 3;
  if (progress >= 25) return 2;
  if (progress >= 12) return 1;
  return 0;
}

function StageVisual({ stage, uploadedImageUrl }: { stage: number; uploadedImageUrl: string }) {
  if (stage === 0) return <div className="studio-progress-image is-analysis"><Image unoptimized src={uploadedImageUrl} alt="Tahlil qilinayotgan yuklangan rasm" fill sizes="360px"/><span className="studio-progress-scan"/><ScanLine className="studio-visual-corner" size={21}/></div>;
  if (stage === 1) return <div className="studio-idea-visual"><Lightbulb size={40}/><span>Kompozitsiya</span><span>Yoritish</span><span>Sahna</span><span>Uslub</span><i/><i/><i/></div>;
  if (stage === 2) return <div className="studio-scene-visual"><div className="studio-blueprint"><Snowflake size={38}/><i/><i/><i/><i/></div><div className="studio-cold-room"><Snowflake size={28}/><span/><span/><span/></div><b/></div>;
  if (stage === 3) return <div className="studio-progress-image is-placement"><div className="studio-scene-grid"/><Image unoptimized src={uploadedImageUrl} alt="Kompozitsiyaga joylanayotgan yuklangan mahsulot" fill sizes="360px"/></div>;
  if (stage === 4) return <div className="studio-progress-image is-lighting"><Image unoptimized src={uploadedImageUrl} alt="Yoritilayotgan yuklangan mahsulot" fill sizes="360px"/><span className="studio-light-sweep"/><Sparkles className="studio-visual-corner" size={21}/></div>;
  if (stage === 5) return <div className="studio-progress-image is-design"><Image unoptimized src={uploadedImageUrl} alt="Dizayn elementlari bilan yuklangan mahsulot" fill sizes="360px"/><span className="studio-design-chip is-type"><Type size={16}/>Aa</span><span className="studio-design-chip is-image"><ImageIcon size={16}/></span><span className="studio-design-chip is-layers"><Layers3 size={16}/></span><i/><b/></div>;
  if (stage === 6) return <div className="studio-progress-image is-inspection"><Image unoptimized src={uploadedImageUrl} alt="Tekshirilayotgan natija tasviri" fill sizes="360px"/><span className="studio-inspection-ring"><Check size={25}/></span><span className="studio-inspection-line"/></div>;
  return <div className="studio-success-visual"><Check size={52}/><span/></div>;
}

export function PhotoStudioGenerationProgress({ mode, uploadedImageUrl, isGenerating, isSuccess, error, onRetry }: Props) {
  const [progress, setProgress] = useState(2);

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => setProgress(current => {
      if (current >= 94) return 94;
      const increment = current < 25 ? 1 : current < 68 ? 0.75 : current < 90 ? 0.5 : 0.25;
      return Math.min(94, Math.round((current + increment) * 100) / 100);
    }), 220);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!isSuccess) return;
    const settleTimer = window.setTimeout(() => setProgress(current => Math.max(94, current)), 0);
    const completeTimer = window.setTimeout(() => setProgress(100), 120);
    return () => { window.clearTimeout(settleTimer); window.clearTimeout(completeTimer); };
  }, [isSuccess]);

  const activeStage = isSuccess ? 7 : stageFor(progress);
  const waiting = isGenerating && progress >= 94;
  const status = useMemo(() => waiting ? { title: "Yakuniy natija tayyorlanmoqda...", helper: "AI hali ishlamoqda. Iltimos, sahifani yopmang." } : stages[activeStage], [activeStage, waiting]);

  return <section className={`studio-generation-progress ${error ? "is-error" : ""} ${isSuccess ? "is-success" : ""}`} aria-live="polite">
    <div className="studio-progress-heading"><span className="studio-ai-badge"><WandSparkles size={14}/>AI BILAN TAYYORLANMOQDA</span><h2>{isSuccess ? "Natija tayyor" : modeTitles[mode]}</h2></div>
    {error ? <div className="studio-progress-error"><span><RefreshCw size={26}/></span><h3>Natijani yaratib bo‘lmadi</h3><p>{error}</p><button type="button" onClick={onRetry}><RefreshCw size={15}/>Qayta urinib ko‘rish</button></div> : <>
      <div className="studio-current-stage" key={activeStage}><StageVisual stage={activeStage} uploadedImageUrl={uploadedImageUrl}/><div><span>0{activeStage + 1} / 08 · {stages[activeStage].name}</span><h3>{status.title}</h3><p>{status.helper}</p></div></div>
      <div className="studio-progress-meter"><div className="studio-progress-track"><span style={{ width: `${Math.min(100, progress)}%` }}><i/></span></div><strong>{Math.floor(progress)}%</strong></div>
      <div className="studio-progress-steps" aria-label="Yaratish bosqichlari">{stages.map((stage, index) => <div key={stage.name} className={index < activeStage ? "is-complete" : index === activeStage ? "is-current" : ""} title={stage.name}><span>{index < activeStage ? <Check size={13}/> : String(index + 1).padStart(2, "0")}</span><small>{stage.name}</small></div>)}</div>
    </>}
  </section>;
}
