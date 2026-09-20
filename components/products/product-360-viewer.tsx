"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import styles from "./product-360-viewer.module.css";

export function Product360Viewer({ frames, label = "360° ko‘rinish", autoRotate = false }: { frames: string[]; label?: string; autoRotate?: boolean }) {
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(autoRotate),[fullscreen,setFullscreen]=useState(false);const root=useRef<HTMLDivElement>(null),drag=useRef<{x:number;index:number}|null>(null);
  const frameIndex=frames.length?index%frames.length:0;
  useEffect(()=>{if(!playing||frames.length<2)return;const timer=window.setInterval(()=>setIndex(value=>(value+1)%frames.length),140);return()=>window.clearInterval(timer);},[playing,frames.length]);
  useEffect(()=>{if(!frames.length)return;for(const offset of [1,2,-1]){const preload=new window.Image();preload.src=frames[(frameIndex+offset+frames.length)%frames.length];}},[frames,frameIndex]);
  useEffect(()=>{const handler=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener("fullscreenchange",handler);return()=>document.removeEventListener("fullscreenchange",handler);},[]);
  const move=(x:number)=>{if(!drag.current||frames.length<2)return;const steps=Math.trunc((drag.current.x-x)/18);setIndex((drag.current.index+steps%frames.length+frames.length)%frames.length);};
  if(!frames.length)return <div className={styles.viewer}><span className={styles.empty}>Ko‘rish uchun kadrlar mavjud emas</span></div>;
  return <div ref={root} className={`${styles.viewer} ${fullscreen?styles.isFullscreen:""}`} onPointerDown={event=>{drag.current={x:event.clientX,index:frameIndex};setPlaying(false);event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>move(event.clientX)} onPointerUp={event=>{drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}}>
    <span className={styles.label}>{label}</span><span className={styles.counter}>{frameIndex+1} / {frames.length}</span><Image unoptimized src={frames[frameIndex]} alt={`${label} — ${frameIndex+1}-kadr`} fill sizes="(max-width: 700px) 100vw, 560px" className={styles.image} preload={frameIndex===0}/><div className={styles.controls}><button type="button" onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>}<span>{playing?"To‘xtatish":"Aylantirish"}</span></button><button type="button" onClick={()=>{setPlaying(false);setIndex(0);}}><RotateCcw size={14}/>Tiklash</button><button type="button" onClick={()=>root.current?.requestFullscreen?.()}><Maximize2 size={14}/>To‘liq ekran</button></div>
  </div>;
}
