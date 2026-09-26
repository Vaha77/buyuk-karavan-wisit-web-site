"use client";

import { useRef } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ImagePlus, UploadCloud, X } from "lucide-react";
import { isPublicNeonImage } from "@/lib/products/image-delivery";
import { MAX_PROJECT_IMAGES, MAX_PROJECT_IMAGE_BYTES, PROJECT_IMAGE_LIMIT_MESSAGE, PROJECT_IMAGE_SIZE_MESSAGE } from "@/lib/projects/image-constants";
import { versionProjectImageUrl } from "@/lib/projects/image-delivery";

export type ProductImagePreview = { id: string; url: string; name: string; file?: File; uploadState?: "pending"|"uploading"|"failed"; uploadError?: string };

export function ProductImageUploader({ images, onChange, onError, title = "Mahsulot rasmlari", projectLabels = false, disabled = false, imageVersion }: { images: ProductImagePreview[]; onChange: (images: ProductImagePreview[]) => void; onError: (message: string) => void; title?: string; projectLabels?: boolean; disabled?: boolean; imageVersion?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList | File[]) => {
    const selected = Array.from(files);
    const maxImages=projectLabels?MAX_PROJECT_IMAGES:12,maxBytes=projectLabels?MAX_PROJECT_IMAGE_BYTES:10*1024*1024;
    if (images.length + selected.length > maxImages) { onError(projectLabels?PROJECT_IMAGE_LIMIT_MESSAGE:"Rasmlar soni juda ko‘p."); return; }
    const incoming: ProductImagePreview[] = [];
    for (const file of selected) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { onError("Rasm formati qo‘llab-quvvatlanmaydi."); return; }
      if (!file.size || file.size > maxBytes) { onError(projectLabels?PROJECT_IMAGE_SIZE_MESSAGE:"Rasm hajmi juda katta."); return; }
      incoming.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file), name: file.name, file });
    }
    onError("");
    onChange([...images, ...incoming]);
  };
  const remove = (id: string) => {
    const target = images.find(image => image.id === id);
    if (target?.file) URL.revokeObjectURL(target.url);
    onChange(images.filter(image => image.id !== id));
  };
  const move = (index: number, direction: number) => {
    const next = [...images], target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <section className="admin-form-card"><div className="admin-form-card-heading"><h2>{title}</h2>{projectLabels ? <p><strong>Asosiy rasm:</strong> birinchi yuklangan rasm. <strong>Galereya:</strong> keyingi rasmlar. Maksimum 50 ta, JPEG, PNG yoki WebP, har biri 20 MB gacha.</p> : <p>Birinchi rasm katalogdagi asosiy rasm bo‘ladi. JPEG, PNG yoki WebP, har biri 10 MB gacha.</p>}</div>
    <input className="sr-only" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }}/>
    <div className="admin-upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if(!disabled)addFiles(event.dataTransfer.files); }}><UploadCloud size={29}/><strong>Rasmlarni shu yerga tashlang</strong><span>yoki kompyuterdan tanlang</span><button disabled={disabled} type="button" onClick={() => fileRef.current?.click()}>Rasm yuklash</button></div>
    {images.length ? <div className="admin-image-grid">{images.map((image, index) => {const displayUrl=!image.file&&projectLabels?versionProjectImageUrl(image.url,imageVersion):image.url;return <div className={`admin-image-preview${image.uploadState==="failed"?" is-upload-failed":""}`} key={image.id}><Image unoptimized={Boolean(image.file) || isPublicNeonImage(displayUrl)} src={displayUrl} alt={image.name} width={160} height={100}/>{index === 0 && <span>Asosiy rasm</span>}{image.uploadState==="failed"&&<small title={image.uploadError}>{image.name}</small>}<div><button type="button" aria-label="Oldinga" disabled={disabled||index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label="Keyinga" disabled={disabled||index === images.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15}/></button><button type="button" aria-label="Rasmni o‘chirish" disabled={disabled} onClick={() => remove(image.id)}><X size={15}/></button></div></div>})}</div> : <div className="admin-empty-images"><ImagePlus size={19}/> Hozircha rasm qo‘shilmagan</div>}
  </section>;
}
