import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDraftTotals } from "../src/components/offer/offerDisplay.js";

test("offer preview rounds each net and VAT line consistently with backend totals", () => {
  assert.deepEqual(calculateDraftTotals(Array.from({ length: 3 }, () => ({ quantity: "1", unitPrice: "0.01", vatRate: "50" }))), { net: "0.03", vat: "0.03", gross: "0.06" });
  assert.deepEqual(calculateDraftTotals([{ quantity: "0.1", unitPrice: "0.2", vatRate: "27" }, { quantity: "3", unitPrice: "100.10", vatRate: "5" }]), { net: "300.32", vat: "15.03", gross: "315.35" });
});

test("offer preview preserves cent precision for large accepted DB inputs", () => {
  const expectedCents = (123456789012341234n * 987654321098765432n + 5000n) / 10000n;
  const fixed = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
  assert.deepEqual(calculateDraftTotals([{ quantity: "12345678901234.1234", unitPrice: "9876543210987654.32", vatRate: "100" }]), { net: fixed(expectedCents), vat: fixed(expectedCents), gross: fixed(expectedCents * 2n) });
});

test("unfinished or invalid numeric edits keep preview renderable", () => {
  for (const quantity of ["", "-", "NaN", "Infinity"]) {
    assert.deepEqual(calculateDraftTotals([{ quantity, unitPrice: "10", vatRate: "27" }]), { net: "0.00", vat: "0.00", gross: "0.00" });
  }
});
