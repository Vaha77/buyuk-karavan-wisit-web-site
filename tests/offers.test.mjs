import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const offers = await import("../lib/offers/rules.ts");

const products = new Map([["a", { title: "BITZER 4NES-20Y", baseUsd: 1000 }], ["b", { title: "FN160 kondensator", baseUsd: 333.33 }]]);

test("client price = Prays price + markup; a line's own markup wins; totals in cents", () => {
  const priced = offers.priceOffer([{ productId: "a", qty: 2, markupPercent: null }, { productId: "b", qty: 3, markupPercent: 10 }], products, 15);
  assert.equal(priced.ok, true);
  assert.deepEqual(priced.items.map(item => [item.markupPercent, item.priceUsd, item.sumUsd]), [[15, 1150, 2300], [10, 366.66, 1099.98]]);
  assert.equal(priced.totalUsd, 3399.98);
  assert.equal(offers.offerNumber(7), "KP-0007");
});

test("bad input is refused: unknown product, quantity, markup", () => {
  assert.equal(offers.priceOffer([{ productId: "x", qty: 1, markupPercent: null }], products, 10).ok, false);
  assert.equal(offers.priceOffer([{ productId: "a", qty: 0, markupPercent: null }], products, 10).ok, false);
  assert.equal(offers.priceOffer([{ productId: "a", qty: 1, markupPercent: -5 }], products, 10).ok, false);
  assert.equal(offers.priceOffer([{ productId: "a", qty: 1, markupPercent: null }], products, 900).ok, false);
  assert.equal(offers.priceOffer([], products, 10).ok, false);
});

test("PDF lines carry no Prays price and no markup", () => {
  const priced = offers.priceOffer([{ productId: "a", qty: 1, markupPercent: 20 }], products, 15);
  const lines = offers.publicLines(priced.items);
  assert.deepEqual(lines, [{ title: "BITZER 4NES-20Y", qty: 1, priceUsd: 1200, sumUsd: 1200 }]);
  assert.ok(!/baseUsd|markup|1000/.test(JSON.stringify(lines)));
});
