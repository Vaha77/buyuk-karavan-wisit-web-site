export const DEFAULT_USD_TO_UZS = "12200";

function decimalParts(value: string) {
  const normalized=value.trim();
  if(!/^\d+(?:\.\d+)?$/.test(normalized))return null;
  const [whole,fraction=""]=normalized.split(".");
  return { whole:BigInt(whole),fraction,scale:BigInt(10)**BigInt(fraction.length) };
}
export function usdToSellingUzs(priceUsd:string,rate:string):bigint|null {
  const price=decimalParts(priceUsd),exchange=decimalParts(rate);if(!price||!exchange)return null;
  const priceScaled=price.whole*price.scale+BigInt(price.fraction||"0");
  const rateScaled=exchange.whole*exchange.scale+BigInt(exchange.fraction||"0");
  const numerator=priceScaled*rateScaled;
  const denominator=price.scale*exchange.scale;
  const thousand=BigInt(1000);
  return ((numerator+denominator*thousand-BigInt(1))/(denominator*thousand))*thousand;
}
export function formatUsd(value:string){const parsed=Number(value);return Number.isFinite(parsed)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:parsed%1?2:0,maximumFractionDigits:2}).format(parsed):"";}
export function formatUzs(value:bigint){const digits=value.toString(),sign=digits.startsWith("-")?"-":"",absolute=sign?digits.slice(1):digits;return `${sign}${absolute.replace(/\B(?=(\d{3})+(?!\d))/g," ")} so‘m`;}
