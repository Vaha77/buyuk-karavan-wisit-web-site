/** Amount in USD; UZS is converted with the CBU rate (UZS per 1 USD). Unknown currency is treated as USD, as in Sale. */
export function toUsd(amount: number | string | { toString(): string } | null | undefined, currency: string | null | undefined, uzsPerUsd: number | null) {
  const value = amount === null || amount === undefined ? 0 : Number(amount.toString());
  if (!Number.isFinite(value) || value === 0) return 0;
  if ((currency || "USD").toUpperCase() === "UZS") return uzsPerUsd && uzsPerUsd > 0 ? value / uzsPerUsd : 0;
  return value;
}
