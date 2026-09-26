import type { CalculationConfiguration, CalculationLineItem } from "./types";
const SCALE = BigInt(1_000_000);
function scaled(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  const text = value.toFixed(6),
    negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const result =
    BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  return negative ? -result : result;
}
function multiply(a: number | null | undefined, b: number | null | undefined) {
  const left = scaled(a),
    right = scaled(b);
  return left === null || right === null
    ? null
    : Number((left * right) / SCALE) / Number(SCALE);
}
export function electricity(
  configuration: Pick<
    CalculationConfiguration,
    "powerKw" | "operatingHoursPerDay"
  >,
  tariff: number | null,
) {
  const dailyEnergyKwh = multiply(
      configuration.powerKw,
      configuration.operatingHoursPerDay,
    ),
    dailyElectricityCost = multiply(dailyEnergyKwh, tariff);
  return {
    dailyEnergyKwh,
    dailyElectricityCost,
    monthlyElectricityCost:
      dailyElectricityCost === null ? null : dailyElectricityCost * 30,
    annualElectricityCost:
      dailyElectricityCost === null ? null : dailyElectricityCost * 365,
  };
}
export function quotationTotals(
  items: CalculationLineItem[],
  discountPercent: number | null,
) {
  const sum = (currency: "USD" | "UZS") =>
      items
        .filter((item) => item.currency === currency)
        .reduce(
          (total, item) =>
            total + (multiply(item.quantity, item.unitPrice) ?? 0),
          0,
        ),
    pct = Math.min(100, Math.max(0, discountPercent ?? 0)),
    usdSubtotal = sum("USD"),
    uzsSubtotal = sum("UZS");
  return {
    usdSubtotal,
    uzsSubtotal,
    usdDiscount: (usdSubtotal * pct) / 100,
    uzsDiscount: (uzsSubtotal * pct) / 100,
    usdTotal: Math.max(0, usdSubtotal * (1 - pct / 100)),
    uzsTotal: Math.max(0, uzsSubtotal * (1 - pct / 100)),
  };
}
export function comparison(
  recommended: CalculationConfiguration,
  market: CalculationConfiguration,
  tariff: number | null,
  rate: number | null,
) {
  const rec = electricity(recommended, tariff),
    alt = electricity(market, tariff),
    priceDifference =
      recommended.priceUsd !== null && market.priceUsd !== null
        ? recommended.priceUsd - market.priceUsd
        : null;
  let paybackMonths: null | number = null;
  if (
    priceDifference !== null &&
    priceDifference > 0 &&
    rate &&
    rate > 0 &&
    rec.monthlyElectricityCost !== null &&
    alt.monthlyElectricityCost !== null
  ) {
    const savings = alt.monthlyElectricityCost - rec.monthlyElectricityCost;
    if (savings > 0) paybackMonths = (priceDifference * rate) / savings;
  }
  return {
    priceDifference,
    monthlyDifference:
      rec.monthlyElectricityCost !== null && alt.monthlyElectricityCost !== null
        ? alt.monthlyElectricityCost - rec.monthlyElectricityCost
        : null,
    paybackMonths: Number.isFinite(paybackMonths) ? paybackMonths : null,
  };
}
export function ownershipCost(
  configuration: CalculationConfiguration,
  tariff: number | null,
  rate: number | null,
) {
  const cost = electricity(configuration, tariff);
  if (
    configuration.priceUsd === null ||
    !rate ||
    rate <= 0 ||
    cost.annualElectricityCost === null
  )
    return null;
  const initial = configuration.priceUsd * rate;
  return {
    oneYear: initial + cost.annualElectricityCost,
    threeYears: initial + cost.annualElectricityCost * 3,
  };
}
