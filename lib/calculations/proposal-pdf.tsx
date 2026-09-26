import "server-only";
import path from "node:path";
import React from "react";
import {
  Document,
  Font,
  Page,
  Path,
  Rect,
  Svg,
  Text,
  View,
  pdf,
  StyleSheet,
} from "@react-pdf/renderer";
import { comparison, electricity, quotationTotals } from "./money";
import type { CalculationDraft } from "./types";

Font.register({
  family: "NotoSans",
  src: path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff",
  ),
});
const c = {
  navy: "#153d5d",
  blue: "#2c6f9d",
  ice: "#eef7fc",
  line: "#cddde8",
  green: "#e8f6ef",
  muted: "#627b8e",
  white: "#ffffff",
};
const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 8.2,
    color: c.navy,
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 34,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: `1px solid ${c.line}`,
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 15, color: c.blue },
  title: { fontSize: 20, letterSpacing: 1.1 },
  meta: { textAlign: "right", fontSize: 7, color: c.muted, lineHeight: 1.5 },
  section: { marginBottom: 15 },
  heading: {
    fontSize: 10.5,
    color: c.blue,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: c.ice,
    padding: 10,
    borderRadius: 5,
  },
  summaryItem: { width: "33.333%", padding: 4 },
  label: {
    fontSize: 6.5,
    color: c.muted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: { fontSize: 8.5 },
  configs: { flexDirection: "row", gap: 7 },
  config: {
    flexGrow: 1,
    flexBasis: 0,
    border: `1px solid ${c.line}`,
    borderRadius: 5,
    padding: 8,
  },
  recommended: { backgroundColor: c.green, border: `1px solid #9ccdb5` },
  configTitle: { fontSize: 8.5, color: c.blue, marginBottom: 6 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    borderBottom: `.5px solid ${c.line}`,
    paddingVertical: 3,
  },
  rowLabel: { fontSize: 6.5, color: c.muted },
  rowValue: { fontSize: 7, textAlign: "right", maxWidth: "62%" },
  disclaimer: {
    fontSize: 6.3,
    lineHeight: 1.45,
    color: c.muted,
    backgroundColor: c.ice,
    padding: 7,
    marginTop: 8,
  },
  comparison: { flexDirection: "row", gap: 8 },
  comparisonCard: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 8,
    border: `1px solid ${c.line}`,
    borderRadius: 4,
  },
  planner: { height: 190, border: `1px solid ${c.line}`, padding: 7 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: c.navy,
    color: c.white,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `.5px solid ${c.line}`,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 24,
  },
  colNo: { width: "6%" },
  colName: { width: "40%" },
  colUnit: { width: "12%" },
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  totals: {
    marginLeft: "55%",
    marginTop: 10,
    borderTop: `1px solid ${c.navy}`,
    paddingTop: 5,
  },
  terms: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  term: { width: "48%", padding: 7, backgroundColor: c.ice },
  conclusion: {
    padding: 10,
    borderLeft: `3px solid ${c.blue}`,
    backgroundColor: c.ice,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: c.muted,
  },
  signature: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: "43%",
    borderTop: `1px solid ${c.line}`,
    paddingTop: 5,
    color: c.muted,
  },
});
const money = (value: number | null, currency = "UZS") =>
  value === null
    ? "—"
    : new Intl.NumberFormat(currency === "USD" ? "en-US" : "uz-UZ", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "USD" ? 2 : 0,
      }).format(value);
const number = (value: number | null, suffix = "") =>
  value === null
    ? "—"
    : `${new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
function Header({ draft }: { draft: CalculationDraft }) {
  return (
    <View style={styles.header} fixed>
      <View>
        <Text style={styles.brand}>BUYUK KARAVAN</Text>
        <Text style={styles.title}>TIJORAT TAKLIFI</Text>
      </View>
      <Text style={styles.meta}>
        {draft.proposalNumber || "TAKLIF"}
        {"\n"}
        {draft.proposalDate}
        {"\n"}
        {draft.validityDays ? `${draft.validityDays} kun amal qiladi` : ""}
      </Text>
    </View>
  );
}
function Planner({ draft }: { draft: CalculationDraft }) {
  const w = 500,
    h = 170,
    p = 12,
    scale = Math.min(
      (w - p * 2) / draft.buildingWidth,
      (h - p * 2) / draft.buildingLength,
    ),
    ox = (w - draft.buildingWidth * scale) / 2,
    oy = (h - draft.buildingLength * scale) / 2;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={styles.planner}>
      <Rect
        x={ox}
        y={oy}
        width={draft.buildingWidth * scale}
        height={draft.buildingLength * scale}
        fill="#fff"
        stroke={c.navy}
        strokeWidth={1}
      />
      {draft.rooms.map((room) => (
        <React.Fragment key={room.id}>
          <Rect
            x={ox + room.x * scale}
            y={oy + room.y * scale}
            width={room.width * scale}
            height={room.length * scale}
            fill={room.type === "ROOM" ? "#dceeff" : "#eef1f4"}
            stroke={room.type === "ROOM" ? c.blue : "#7890a5"}
            strokeWidth={0.8}
          />
          <Text
            x={ox + (room.x + room.width / 2) * scale}
            y={oy + (room.y + room.length / 2) * scale}
            style={{
              fontSize: Math.max(5, Math.min(8, (room.width * scale) / 6)),
              textAnchor: "middle",
            }}
          >
            {room.name} · {room.width}×{room.length} m
          </Text>
          {room.doorEnabled && (
            <Path
              d={`M ${ox + (room.x + room.width * 0.38) * scale} ${oy + (room.y + room.length) * scale} L ${ox + (room.x + room.width * 0.62) * scale} ${oy + (room.y + room.length) * scale}`}
              stroke="#fff"
              strokeWidth={3}
            />
          )}
        </React.Fragment>
      ))}
    </Svg>
  );
}
function ProposalDocument({
  draft,
  rate,
}: {
  draft: CalculationDraft;
  rate: number | null;
}) {
  const totals = quotationTotals(draft.lineItems, draft.discountPercent),
    recommended = draft.configurations.find((x) => x.type === "RECOMMENDED")!;
  return (
    <Document
      title={`${draft.proposalNumber} — ${draft.projectName}`}
      author="BUYUK KARAVAN"
    >
      <Page size="A4" style={styles.page}>
        <Header draft={draft} />
        <View style={styles.section}>
          <Text style={styles.heading}>MIJOZ VA LOYIHA</Text>
          <View style={styles.summary}>
            {[
              ["Mijoz", draft.customerName],
              ["Hudud", draft.region || "—"],
              ["Loyiha", draft.projectName],
              ["Kamera soni", String(draft.cameraCount)],
              ["Umumiy sig‘im", `${draft.capacityTons} tonna`],
              [
                "Harorat",
                `${draft.temperatureMin}°C ... ${draft.temperatureMax}°C`,
              ],
            ].map(([a, b]) => (
              <View style={styles.summaryItem} key={a}>
                <Text style={styles.label}>{a}</Text>
                <Text style={styles.value}>{b}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>SIZNING LOYIHANGIZ UCHUN YECHIMLAR</Text>
          <View style={styles.configs}>
            {draft.configurations.map((item) => {
              const e = electricity(item, draft.electricityTariff);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.config,
                    item.type === "RECOMMENDED" ? styles.recommended : {},
                  ]}
                >
                  <Text style={styles.configTitle}>
                    {item.label.toLocaleUpperCase("uz-UZ")}
                  </Text>
                  {[
                    ["Kompressor", item.compressor || "—"],
                    ["Kondensator", item.condenser || "—"],
                    ["Evaporator", item.evaporator || "—"],
                    ["Komplekt narxi", money(item.priceUsd, "USD")],
                    ["Quvvat", number(item.powerKw, " kW")],
                    [
                      "Ish rejimi",
                      number(item.operatingHoursPerDay, " soat/kun"),
                    ],
                    ["Elektr sarfi", number(e.dailyEnergyKwh, " kWh/kun")],
                    ["Oylik elektr", money(e.monthlyElectricityCost)],
                    ["Yillik elektr", money(e.annualElectricityCost)],
                  ].map(([a, b]) => (
                    <View style={styles.row} key={a}>
                      <Text style={styles.rowLabel}>{a}</Text>
                      <Text style={styles.rowValue}>{b}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
          <Text style={styles.disclaimer}>
            Ish vaqti va elektr sarfi loyiha sharoitlari asosidagi hisobiy
            ko‘rsatkichlardir. Haqiqiy sarf tashqi harorat, issiqlik
            izolyatsiyasi, mahsulot yuklanishi, eshiklarning ochilish
            chastotasi, belgilangan harorat va foydalanish sharoitlariga qarab
            farq qilishi mumkin.
          </Text>
        </View>
        {draft.configurations.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.heading}>
              BOSHLANG‘ICH XARAJAT VA EKSPLUATATSIYA XARAJATI
            </Text>
            <View style={styles.comparison}>
              {draft.configurations
                .filter((x) => x.type !== "RECOMMENDED")
                .map((item) => {
                  const value = comparison(
                    recommended,
                    item,
                    draft.electricityTariff,
                    rate,
                  );
                  return (
                    <View style={styles.comparisonCard} key={item.id}>
                      <Text style={styles.configTitle}>{item.label}</Text>
                      <Text>
                        Boshlang‘ich narx farqi:{" "}
                        {money(value.priceDifference, "USD")}
                      </Text>
                      <Text>
                        Oylik elektr farqi: {money(value.monthlyDifference)}
                      </Text>
                      {value.paybackMonths !== null && (
                        <Text>
                          Taxminiy qoplanish muddati: ≈{" "}
                          {value.paybackMonths.toFixed(1)} oy
                        </Text>
                      )}
                    </View>
                  );
                })}
            </View>
          </View>
        )}
        <View style={styles.section}>
          <Text style={styles.heading}>KAMERA CHIZMASI</Text>
          <Planner draft={draft} />
        </View>
        <View style={styles.footer} fixed>
          <Text>BUYUK KARAVAN · professional sovutish yechimlari</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
      <Page size="A4" style={styles.page} wrap>
        <Header draft={draft} />
        <Text style={styles.heading}>SMETA / MAHSULOT VA XIZMATLAR</Text>
        <View style={styles.tableHeader} fixed>
          <Text style={styles.colNo}>№</Text>
          <Text style={styles.colName}>Mahsulot / xizmat</Text>
          <Text style={styles.colUnit}>Birlik</Text>
          <Text style={styles.colQty}>Miqdor</Text>
          <Text style={styles.colPrice}>Narx</Text>
          <Text style={styles.colTotal}>Jami</Text>
        </View>
        {draft.lineItems.map((item, index) => (
          <View style={styles.tableRow} key={item.id} wrap={false}>
            <Text style={styles.colNo}>{index + 1}</Text>
            <Text style={styles.colName}>{item.name}</Text>
            <Text style={styles.colUnit}>{item.unit}</Text>
            <Text style={styles.colQty}>{number(item.quantity)}</Text>
            <Text style={styles.colPrice}>
              {money(item.unitPrice, item.currency)}
            </Text>
            <Text style={styles.colTotal}>
              {money(item.quantity * item.unitPrice, item.currency)}
            </Text>
          </View>
        ))}
        <View style={styles.totals} wrap={false}>
          {[
            ["USD subtotal", money(totals.usdSubtotal, "USD")],
            ["UZS subtotal", money(totals.uzsSubtotal)],
            [`Chegirma (${draft.discountPercent || 0}%)`, ""],
            ["JAMI USD", money(totals.usdTotal, "USD")],
            ["JAMI UZS", money(totals.uzsTotal)],
          ].map(([a, b]) => (
            <View style={styles.row} key={a}>
              <Text>{a}</Text>
              <Text>{b}</Text>
            </View>
          ))}
        </View>
        <View style={styles.section} wrap={false}>
          <Text style={styles.heading}>TIJORAT SHARTLARI</Text>
          <View style={styles.terms}>
            {[
              ["To‘lov", draft.paymentTerms],
              ["Yetkazib berish", draft.deliveryTerms],
              [
                "Montaj",
                draft.installationIncluded === null
                  ? "—"
                  : draft.installationIncluded
                    ? "Kiritilgan"
                    : "Kiritilmagan",
              ],
              [
                "Transport",
                draft.transportIncluded === null
                  ? "—"
                  : draft.transportIncluded
                    ? "Kiritilgan"
                    : "Kiritilmagan",
              ],
              [
                "Ishga tushirish",
                draft.commissioningIncluded === null
                  ? "—"
                  : draft.commissioningIncluded
                    ? "Kiritilgan"
                    : "Kiritilmagan",
              ],
              ["Kafolat", draft.warranty],
            ].map(([a, b]) => (
              <View style={styles.term} key={a}>
                <Text style={styles.label}>{a}</Text>
                <Text>{b || "—"}</Text>
              </View>
            ))}
          </View>
        </View>
        {draft.specialistConclusion && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.heading}>MUTAXASSIS XULOSASI</Text>
            <Text style={styles.conclusion}>{draft.specialistConclusion}</Text>
          </View>
        )}
        <View style={styles.signature} wrap={false}>
          <Text style={styles.signatureBox}>
            Sotuvchi: {draft.sellerName || "BUYUK KARAVAN"}
          </Text>
          <Text style={styles.signatureBox}>Imzo / muhr</Text>
        </View>
        <View style={styles.footer} fixed>
          <Text>BUYUK KARAVAN · {draft.proposalNumber}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
export async function renderProposalPdf(
  draft: CalculationDraft,
  rate: number | null,
) {
  return pdf(<ProposalDocument draft={draft} rate={rate} />).toBuffer();
}
