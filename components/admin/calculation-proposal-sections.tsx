"use client";
import { Download, Eye, Plus, Share2, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  comparison,
  electricity,
  ownershipCost,
  quotationTotals,
} from "@/lib/calculations/money";
import type {
  CalculationConfiguration,
  CalculationDraft,
  ConfigurationType,
  ProductProposalOption,
} from "@/lib/calculations/types";

const disclaimer =
  "Ish vaqti va elektr sarfi loyiha sharoitlari asosidagi hisobiy ko‘rsatkichlardir. Haqiqiy sarf tashqi harorat, issiqlik izolyatsiyasi, mahsulot yuklanishi, eshiklarning ochilish chastotasi, belgilangan harorat va foydalanish sharoitlariga qarab farq qilishi mumkin.";
const labels: Record<ConfigurationType, string> = {
  RECOMMENDED: "Mutaxassis tavsiyasi",
  MARKET_1: "Bozor taklifi 1",
  MARKET_2: "Bozor taklifi 2",
};
const num = (value: string) =>
  value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const money = (value: number | null, currency = "UZS") =>
  value === null
    ? "—"
    : new Intl.NumberFormat(currency === "USD" ? "en-US" : "uz-UZ", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "USD" ? 2 : 0,
      }).format(value);
const decimal = (value: number | null, suffix: string) =>
  value === null
    ? "—"
    : `${new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(value)} ${suffix}`;
function config(
  type: ConfigurationType,
  order: number,
): CalculationConfiguration {
  return {
    id: crypto.randomUUID(),
    type,
    label: labels[type],
    compressor: "",
    compressorNote: "",
    condenser: "",
    condenserNote: "",
    evaporator: "",
    evaporatorNote: "",
    refrigerant: "",
    electricalPanel: "",
    trv: "",
    copperPipe: "",
    fittings: "",
    freon: "",
    installationAccessories: "",
    includedEquipment: "",
    priceUsd: null,
    powerKw: null,
    operatingHoursPerDay: null,
    order,
  };
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <label className="calculation-field">
      <span>{label}</span>
      <input
        type={type}
        step={step}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function ConfigurationCard({
  item,
  tariff,
  update,
  remove,
  removable,
}: {
  item: CalculationConfiguration;
  tariff: number | null;
  update: (next: CalculationConfiguration) => void;
  remove: () => void;
  removable: boolean;
}) {
  const set = <K extends keyof CalculationConfiguration>(
      key: K,
      value: CalculationConfiguration[K],
    ) => update({ ...item, [key]: value }),
    cost = electricity(item, tariff);
  return (
    <article
      className={`proposal-config-card${item.type === "RECOMMENDED" ? " is-recommended" : ""}`}
    >
      <header>
        <div>
          <span>
            {item.type === "RECOMMENDED" ? "ASOSIY YECHIM" : "TAQQOSLASH"}
          </span>
          <input
            aria-label="Variant nomi"
            value={item.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </div>
        {removable && (
          <button
            type="button"
            onClick={remove}
            aria-label="Variantni o‘chirish"
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>
      <div className="proposal-fields">
        <Input
          label="Kompressor"
          value={item.compressor}
          onChange={(v) => set("compressor", v)}
        />
        <Input
          label="Kondensator"
          value={item.condenser}
          onChange={(v) => set("condenser", v)}
        />
        <Input
          label="Evaporator"
          value={item.evaporator}
          onChange={(v) => set("evaporator", v)}
        />
        <Input
          label="Komplekt narxi (USD)"
          type="number"
          step="0.01"
          value={item.priceUsd}
          onChange={(v) => set("priceUsd", num(v))}
        />
        <Input
          label="Quvvat (kW)"
          type="number"
          step="0.001"
          value={item.powerKw}
          onChange={(v) => set("powerKw", num(v))}
        />
        <Input
          label="Ish rejimi (soat/kun)"
          type="number"
          step="0.1"
          value={item.operatingHoursPerDay}
          onChange={(v) => set("operatingHoursPerDay", num(v))}
        />
        <Input
          label="Sovutgich agent"
          value={item.refrigerant}
          onChange={(v) => set("refrigerant", v)}
        />
        <Input
          label="Elektr panel"
          value={item.electricalPanel}
          onChange={(v) => set("electricalPanel", v)}
        />
        <label className="calculation-field is-wide">
          <span>Komplekt tarkibi / mutaxassis izohi</span>
          <textarea
            rows={3}
            value={item.includedEquipment}
            onChange={(e) => set("includedEquipment", e.target.value)}
          />
        </label>
      </div>
      <dl className="electricity-summary">
        <div>
          <dt>Elektr sarfi</dt>
          <dd>{decimal(cost.dailyEnergyKwh, "kWh/kun")}</dd>
        </div>
        <div>
          <dt>Kunlik</dt>
          <dd>{money(cost.dailyElectricityCost)}</dd>
        </div>
        <div>
          <dt>Oylik</dt>
          <dd>{money(cost.monthlyElectricityCost)}</dd>
        </div>
        <div>
          <dt>Yillik</dt>
          <dd>{money(cost.annualElectricityCost)}</dd>
        </div>
      </dl>
    </article>
  );
}
export function CalculationProposalSections({
  draft,
  setDraft,
  products,
}: {
  draft: CalculationDraft;
  setDraft: Dispatch<SetStateAction<CalculationDraft>>;
  products: ProductProposalOption[];
}) {
  const [preview, setPreview] = useState(false),
    [pdfBusy, setPdfBusy] = useState(false),
    set = <K extends keyof CalculationDraft>(
      key: K,
      value: CalculationDraft[K],
    ) => setDraft((current) => ({ ...current, [key]: value }));
  const totals = useMemo(
      () => quotationTotals(draft.lineItems, draft.discountPercent),
      [draft.lineItems, draft.discountPercent],
    ),
    recommended = draft.configurations.find((x) => x.type === "RECOMMENDED")!;
  const addVariant = () => {
    const type: ConfigurationType = !draft.configurations.some(
      (x) => x.type === "MARKET_1",
    )
      ? "MARKET_1"
      : "MARKET_2";
    set("configurations", [
      ...draft.configurations,
      config(type, draft.configurations.length),
    ]);
  };
  const updateConfig = (id: string, next: CalculationConfiguration) =>
    set(
      "configurations",
      draft.configurations.map((x) => (x.id === id ? next : x)),
    );
  const addItem = () =>
    set("lineItems", [
      ...draft.lineItems,
      {
        id: crypto.randomUUID(),
        productId: null,
        name: "",
        unit: "dona",
        quantity: 1,
        unitPrice: 0,
        currency: "USD",
        order: draft.lineItems.length,
      },
    ]);
  const updateItem = (id: string, key: string, value: unknown) =>
    setDraft((current) => ({
      ...current,
      lineItems: current.lineItems.map((x) =>
        x.id === id ? { ...x, [key]: value } : x,
      ),
    }));
  const pdfUrl = draft.id ? `/admin/calculations/${draft.id}/pdf` : "";
  const download = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "";
    a.click();
  };
  const share = async () => {
    if (!pdfUrl) return;
    setPdfBusy(true);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error("PDF");
      const blob = await response.blob(),
        file = new File(
          [blob],
          `${draft.proposalNumber || "tijorat-taklifi"}.pdf`,
          { type: "application/pdf" },
        );
      if (navigator.share && navigator.canShare?.({ files: [file] }))
        await navigator.share({
          title: "BUYUK KARAVAN tijorat taklifi",
          files: [file],
        });
      else download();
    } catch {
      download();
    } finally {
      setPdfBusy(false);
    }
  };
  return (
    <div className="proposal-sections">
      <section className="admin-form-card">
        <div className="proposal-section-heading">
          <div>
            <span>03</span>
            <h2>Konfiguratsiyalar</h2>
            <p>
              Uskunani mutaxassis tanlaydi. Sayt faqat kiritilgan qiymatlarni
              hisoblaydi.
            </p>
          </div>
          {draft.configurations.length < 3 && (
            <button type="button" onClick={addVariant}>
              <Plus size={15} />
              Bozor taklifi qo‘shish
            </button>
          )}
        </div>
        <label className="calculation-field proposal-tariff">
          <span>Elektr tarifi (so‘m/kWh)</span>
          <input
            type="number"
            step="0.01"
            value={draft.electricityTariff ?? ""}
            onChange={(e) => set("electricityTariff", num(e.target.value))}
          />
        </label>
        <div
          className={`proposal-config-grid has-${draft.configurations.length}`}
        >
          {draft.configurations.map((item) => (
            <ConfigurationCard
              key={item.id}
              item={item}
              tariff={draft.electricityTariff}
              update={(next) => updateConfig(item.id, next)}
              remove={() =>
                set(
                  "configurations",
                  draft.configurations
                    .filter((x) => x.id !== item.id)
                    .map((x, order) => ({ ...x, order })),
                )
              }
              removable={item.type !== "RECOMMENDED"}
            />
          ))}
        </div>
        <p className="proposal-disclaimer">{disclaimer}</p>
        {draft.configurations.length > 1 && (
          <div className="comparison-grid">
            {draft.configurations
              .filter((x) => x.type !== "RECOMMENDED")
              .map((item) => {
                const result = comparison(
                    recommended,
                    item,
                    draft.electricityTariff,
                    draft.exchangeRate ?? null,
                  ),
                  ownership = ownershipCost(
                    item,
                    draft.electricityTariff,
                    draft.exchangeRate ?? null,
                  );
                return (
                  <article key={item.id}>
                    <strong>{item.label}</strong>
                    <span>
                      Boshlang‘ich narx farqi:{" "}
                      {money(result.priceDifference, "USD")}
                    </span>
                    <span>
                      Oylik elektr farqi: {money(result.monthlyDifference)}
                    </span>
                    {result.paybackMonths !== null && (
                      <b>
                        Taxminiy qoplanish muddati: ≈{" "}
                        {result.paybackMonths.toFixed(1)} oy
                      </b>
                    )}
                    {ownership && (
                      <small>
                        Hisobiy umumiy xarajat — 1 yil:{" "}
                        {money(ownership.oneYear)} · 3 yil:{" "}
                        {money(ownership.threeYears)}
                      </small>
                    )}
                  </article>
                );
              })}
          </div>
        )}
      </section>
      <section className="admin-form-card">
        <div className="proposal-section-heading">
          <div>
            <span>04</span>
            <h2>Smeta / mahsulot va xizmatlar</h2>
          </div>
          <button type="button" onClick={addItem}>
            <Plus size={15} />
            Qator qo‘shish
          </button>
        </div>
        <div className="proposal-items">
          {draft.lineItems.map((item, index) => (
            <article className="proposal-item" key={item.id}>
              <b>{index + 1}</b>
              <label>
                <span>Mavjud mahsulot</span>
                <select
                  value={item.productId || ""}
                  onChange={(e) => {
                    const product = products.find(
                      (x) => x.id === e.target.value,
                    );
                    updateItem(item.id, "productId", product?.id || null);
                    if (product) {
                      updateItem(
                        item.id,
                        "name",
                        `${product.name} ${product.model}`.trim(),
                      );
                      if (product.priceUsd)
                        updateItem(
                          item.id,
                          "unitPrice",
                          Number(product.priceUsd),
                        );
                    }
                  }}
                >
                  <option value="">Qo‘lda kiritish</option>
                  {products.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name} — {x.model}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Mahsulot / xizmat"
                value={item.name}
                onChange={(v) => updateItem(item.id, "name", v)}
              />
              <Input
                label="Birlik"
                value={item.unit}
                onChange={(v) => updateItem(item.id, "unit", v)}
              />
              <Input
                label="Miqdor"
                type="number"
                step="0.001"
                value={item.quantity}
                onChange={(v) => updateItem(item.id, "quantity", num(v) ?? 0)}
              />
              <Input
                label="Birlik narxi"
                type="number"
                step="0.01"
                value={item.unitPrice}
                onChange={(v) => updateItem(item.id, "unitPrice", num(v) ?? 0)}
              />
              <label>
                <span>Valyuta</span>
                <select
                  value={item.currency}
                  onChange={(e) =>
                    updateItem(item.id, "currency", e.target.value)
                  }
                >
                  <option>USD</option>
                  <option>UZS</option>
                </select>
              </label>
              <strong>
                {money(item.quantity * item.unitPrice, item.currency)}
              </strong>
              <button
                type="button"
                onClick={() =>
                  set(
                    "lineItems",
                    draft.lineItems
                      .filter((x) => x.id !== item.id)
                      .map((x, order) => ({ ...x, order })),
                  )
                }
                aria-label="Qatorni o‘chirish"
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
        <div className="proposal-totals">
          <Input
            label="Chegirma (%)"
            type="number"
            step="0.01"
            value={draft.discountPercent}
            onChange={(v) => set("discountPercent", num(v))}
          />
          <dl>
            <div>
              <dt>USD subtotal</dt>
              <dd>{money(totals.usdSubtotal, "USD")}</dd>
            </div>
            <div>
              <dt>UZS subtotal</dt>
              <dd>{money(totals.uzsSubtotal)}</dd>
            </div>
            <div>
              <dt>Jami USD</dt>
              <dd>{money(totals.usdTotal, "USD")}</dd>
            </div>
            <div>
              <dt>Jami UZS</dt>
              <dd>{money(totals.uzsTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="admin-form-card">
        <div className="proposal-section-heading">
          <div>
            <span>05</span>
            <h2>Tijorat shartlari</h2>
          </div>
        </div>
        <div className="proposal-fields">
          <Input
            label="Taklif raqami"
            value={draft.proposalNumber || "Saqlanganda yaratiladi"}
            onChange={() => {}}
          />
          <Input
            label="Taklif sanasi"
            type="date"
            value={draft.proposalDate}
            onChange={(v) => set("proposalDate", v)}
          />
          <Input
            label="Amal qilish muddati (kun)"
            type="number"
            value={draft.validityDays}
            onChange={(v) => set("validityDays", num(v))}
          />
          <label className="calculation-field">
            <span>Holat</span>
            <select
              value={draft.status}
              onChange={(e) =>
                set("status", e.target.value as CalculationDraft["status"])
              }
            >
              <option value="DRAFT">Qoralama</option>
              <option value="READY">Tayyor</option>
              <option value="SENT">Yuborildi</option>
              <option value="NEGOTIATION">Muzokara</option>
              <option value="APPROVED">Tasdiqlandi</option>
              <option value="REJECTED">Rad etildi</option>
            </select>
          </label>
          <Input
            label="To‘lov shartlari"
            value={draft.paymentTerms}
            onChange={(v) => set("paymentTerms", v)}
          />
          <Input
            label="Yetkazib berish muddati"
            value={draft.deliveryTerms}
            onChange={(v) => set("deliveryTerms", v)}
          />
          <Input
            label="Kafolat"
            value={draft.warranty}
            onChange={(v) => set("warranty", v)}
          />
          <label className="calculation-field is-wide">
            <span>Mutaxassis xulosasi</span>
            <textarea
              rows={4}
              value={draft.specialistConclusion}
              onChange={(e) => set("specialistConclusion", e.target.value)}
            />
          </label>
          <label className="calculation-field is-wide">
            <span>Qo‘shimcha izoh</span>
            <textarea
              rows={3}
              value={draft.commercialNotes}
              onChange={(e) => set("commercialNotes", e.target.value)}
            />
          </label>
        </div>
        <div className="proposal-checks">
          {[
            ["installationIncluded", "Montaj kiritilgan"],
            ["transportIncluded", "Transport kiritilgan"],
            ["commissioningIncluded", "Ishga tushirish kiritilgan"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={draft[key as keyof CalculationDraft] === true}
                onChange={(e) =>
                  set(key as keyof CalculationDraft, e.target.checked as never)
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      <section className="admin-form-card proposal-pdf">
        <div className="proposal-section-heading">
          <div>
            <span>06–08</span>
            <h2>PDF ko‘rinish va ulashish</h2>
            <p>
              PDF serverda saqlangan va tekshirilgan ma’lumotlardan yaratiladi.
            </p>
          </div>
        </div>
        {!draft.id ? (
          <p className="proposal-disclaimer">
            PDF yaratish uchun avval taklifni saqlang.
          </p>
        ) : (
          <>
            <div className="proposal-pdf-actions">
              <button type="button" onClick={() => setPreview((x) => !x)}>
                <Eye size={16} />
                PDF ko‘rish
              </button>
              <button type="button" onClick={download}>
                <Download size={16} />
                PDF yuklab olish
              </button>
              <button type="button" disabled={pdfBusy} onClick={share}>
                <Share2 size={16} />
                {pdfBusy ? "Tayyorlanmoqda…" : "Ulashish"}
              </button>
            </div>
            {preview && (
              <iframe
                title="Tijorat taklifi PDF ko‘rinishi"
                src={`${pdfUrl}?inline=1`}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
