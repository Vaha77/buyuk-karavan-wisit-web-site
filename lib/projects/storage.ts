import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
const MAX = 10 * 1024 * 1024;
const formats = new Map([
  ["image/jpeg", { ext: "jpg", valid: (b: Uint8Array) => b[0]===0xff&&b[1]===0xd8&&b[2]===0xff }],
  ["image/png", { ext: "png", valid: (b: Uint8Array) => b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47 }],
  ["image/webp", { ext: "webp", valid: (b: Uint8Array) => String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP" }],
]);
export class ProjectImageError extends Error {}
function config(){ const endpoint=process.env.AWS_ENDPOINT_URL_S3,bucket=process.env.NEON_STORAGE_BUCKET,region=process.env.AWS_REGION,accessKeyId=process.env.AWS_ACCESS_KEY_ID,secretAccessKey=process.env.AWS_SECRET_ACCESS_KEY; if(!endpoint||!bucket||!region||!accessKeyId||!secretAccessKey) throw new Error("Project image storage is not configured"); const url=new URL(endpoint); if(url.protocol!=="https:"||!url.hostname.endsWith(".neon.tech")) throw new Error("Invalid storage endpoint"); return {endpoint:url.origin,bucket,region,accessKeyId,secretAccessKey}; }
function client(){const c=config();return new S3Client({endpoint:c.endpoint,region:c.region,forcePathStyle:true,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey}});}
export function ownedProjectImageKey(url:string,id:string){const c=config();try{const p=new URL(url),prefix=`${c.endpoint}/${c.bucket}/projects/${id}/`;if(!p.search&&!p.hash&&p.href.startsWith(prefix)){const key=p.href.slice(`${c.endpoint}/${c.bucket}/`.length);if(/^projects\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(key))return key;}}catch{}return null;}
export async function uploadProjectImage(id:string,file:File){if(!(file instanceof File))throw new ProjectImageError("Rasmni tanlang.");const format=formats.get(file.type);if(!format)throw new ProjectImageError("Rasm formati qo'llab-quvvatlanmaydi.");if(!file.size||file.size>MAX)throw new ProjectImageError("Rasm hajmi juda katta.");const body=new Uint8Array(await file.arrayBuffer());if(!format.valid(body))throw new ProjectImageError("Rasm formati qo'llab-quvvatlanmaydi.");const c=config(),key=`projects/${id}/${randomUUID()}.${format.ext}`;await client().send(new PutObjectCommand({Bucket:c.bucket,Key:key,Body:body,ContentType:file.type}));return `${c.endpoint}/${c.bucket}/${key}`;}
export async function deleteOwnedProjectImage(url:string,id:string){const key=ownedProjectImageKey(url,id);if(!key)return;const c=config();await client().send(new DeleteObjectCommand({Bucket:c.bucket,Key:key}));}
