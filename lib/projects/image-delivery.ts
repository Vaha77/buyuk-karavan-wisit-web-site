import { isPublicNeonImage } from "@/lib/products/image-delivery";

export function versionProjectImageUrl(src:string,version:string|Date|undefined):string{
  if(!version||!isPublicNeonImage(src))return src;
  try{const url=new URL(src);url.searchParams.set("v",version instanceof Date?version.toISOString():version);return url.toString();}catch{return src;}
}
