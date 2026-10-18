import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const { normalizeUzPhone, formatUzPhone } = await import("../lib/auth/phone.ts");

test("phone: spaces, dashes (incl. iPhone U+2011), dots, brackets, without +998, 00998, leading 0", () => {
  for (const input of ["+998 90 123 45 67", "90 123-45-67", "901234567", "998901234567", "+998 (90) 123‑45‑67", "0901234567", "00998901234567", "90.123.45.67", " +998\u00a090\u00a01234567 "]) assert.equal(normalizeUzPhone(input), "+998901234567", input);
  for (const input of ["", "abc", "12345", "+7 912 345 67 89", "90123456a"]) assert.equal(normalizeUzPhone(input), null, input);
  assert.equal(formatUzPhone("+998901234567"), "+998 90 123 45 67");
});
