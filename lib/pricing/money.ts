export const DEFAULT_USD_TO_UZS = "12200";

function decimalParts(value: string) {
  const normalized=value.trim();
  if(!/^\d+(?:\.\d+)?$/.test(normalized))return null;
  const [whole,fraction=""]=normalized.split(".");
  return { whole:BigInt(whole),fraction,scale:BigInt(10)**BigInt(fraction.length) };
}
export function usdToUzs(priceUsd:string,rate:string):bigint|null {
  const price=decimalParts(priceUsd),exchange=decimalParts(rate);if(!price||!exchange)return null;
  const priceScaled=price.whole*price.scale+BigInt(price.fraction||"0");
  const rateScaled=exchange.whole*exchange.scale+BigInt(exchange.fraction||"0");
  return (priceScaled*rateScaled+(price.scale*exchange.scale/BigInt(2)))/(price.scale*exchange.scale);
}
export function formatUsd(value:string){const parsed=Number(value);return Number.isFinite(parsed)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:parsed%1?2:0,maximumFractionDigits:2}).format(parsed):"";}
export function formatUzs(value:bigint){return `${new Intl.NumberFormat("uz-UZ").format(value)} so‘m`;}
