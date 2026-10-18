import Image from "next/image";

/** Small Buyuk Karavan emblem (32px) before the "BUYUK KARAVAN" wordmark in the sidebar and on the login pages. */
export function BrandEmblem() {
  return <Image src="/admin-icons/emblem-64.png" alt="" width={32} height={32} className="admin-emblem"/>;
}
