import "server-only";
import path from "node:path";
import React from "react";
import { Document, Font, Page, Path, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import type { publicLines } from "./rules";

Font.register({ family: "NotoSans", fonts: [
  { src: path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff"), fontWeight: 400 },
  { src: path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff"), fontWeight: 700 },
] });

/** Everything the PDF shows. No Prays price, no markup: the lines are publicLines(). */
export type OfferPdfData = {
  number: string; date: string; validUntil: string; customerName: string; customerPhone: string | null;
  lines: ReturnType<typeof publicLines>; totalUsd: number; sellerName: string; sellerPhone: string | null;
};

const navy = "#123E7C", ink = "#0F1E33", muted = "#5B6B82", line = "#D9E3F3";
const s = StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: 9.5, color: ink, padding: 36 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${navy}`, paddingBottom: 12, marginBottom: 18 },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 }, brandText: { fontSize: 15, fontWeight: 700, color: navy, letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 }, meta: { color: muted, marginBottom: 2 },
  box: { flexDirection: "row", justifyContent: "space-between", marginVertical: 14, padding: 10, backgroundColor: "#F3F6FB", borderRadius: 4 },
  label: { color: muted, fontSize: 8, marginBottom: 2 }, strong: { fontWeight: 700 },
  row: { flexDirection: "row", borderBottom: `1px solid ${line}`, paddingVertical: 6 }, th: { backgroundColor: navy, color: "#fff", fontWeight: 700, borderBottom: 0, paddingHorizontal: 4 },
  no: { width: "6%" }, name: { width: "52%" }, qty: { width: "10%", textAlign: "right" }, price: { width: "16%", textAlign: "right" }, sum: { width: "16%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 12, fontWeight: 700 },
  foot: { position: "absolute", left: 36, right: 36, bottom: 28, borderTop: `1px solid ${line}`, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", color: muted, fontSize: 8.5 },
});
const usd = (value: number) => `$${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)}`;

function OfferDocument({ data }: { data: OfferPdfData }) {
  return <Document title={`Tijorat taklifi ${data.number}`}><Page size="A4" style={s.page}>
    <View style={s.head}>
      <View style={s.brand}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1" stroke={navy} strokeWidth={2.6} strokeLinecap="round"/></Svg><Text style={s.brandText}>BUYUK KARAVAN</Text></View>
      <Text style={{ color: muted }}>{data.number}</Text>
    </View>
    <Text style={s.title}>Tijorat taklifi {data.number}</Text>
    <Text style={s.meta}>Sana: {data.date}</Text>
    <Text style={s.meta}>Amal qilish muddati: {data.validUntil} gacha</Text>
    <View style={s.box}>
      <View><Text style={s.label}>Mijoz</Text><Text style={s.strong}>{data.customerName}</Text>{data.customerPhone && <Text>{data.customerPhone}</Text>}</View>
      <View style={{ alignItems: "flex-end" }}><Text style={s.label}>Sotuvchi</Text><Text style={s.strong}>{data.sellerName}</Text>{data.sellerPhone && <Text>{data.sellerPhone}</Text>}</View>
    </View>
    <View style={[s.row, s.th]} fixed><Text style={s.no}>№</Text><Text style={s.name}>Nomi</Text><Text style={s.qty}>Soni</Text><Text style={s.price}>Narx</Text><Text style={s.sum}>Summa</Text></View>
    {data.lines.map((item, index) => <View key={index} style={[s.row, { paddingHorizontal: 4 }]} wrap={false}>
      <Text style={s.no}>{index + 1}</Text><Text style={s.name}>{item.title}</Text><Text style={s.qty}>{item.qty}</Text><Text style={s.price}>{usd(item.priceUsd)}</Text><Text style={s.sum}>{usd(item.sumUsd)}</Text>
    </View>)}
    <View style={s.total}><Text>Jami:</Text><Text>{usd(data.totalUsd)}</Text></View>
    <View style={s.foot} fixed><Text>BUYUK KARAVAN · {data.sellerName}{data.sellerPhone ? ` · ${data.sellerPhone}` : ""}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}/></View>
  </Page></Document>;
}

export async function renderOfferPdf(data: OfferPdfData) {
  const stream = await pdf(<OfferDocument data={data}/>).toBuffer(), chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
