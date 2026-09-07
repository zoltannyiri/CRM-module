import assert from "node:assert/strict";
import test from "node:test";

import { buildContactExport } from "../src/services/contactExportService.js";

const contacts = [{
  firstName: "Anna",
  lastName: "Kovács",
  position: "Ügyvezető",
  email: "anna@example.invalid",
  phone: "+36 30 123 4567",
  note: "Elsődleges kapcsolattartó",
  partner: { id: 1, name: "Minta Kft.", type: "COMPANY" },
}];

test("contact exports create valid XLSX, PDF and CSV files", async () => {
  const xlsx = await buildContactExport({ format: "xlsx", contacts, organizationName: "Teszt Kft." });
  assert.equal(xlsx.subarray(0, 2).toString(), "PK");
  const pdf = await buildContactExport({ format: "pdf", contacts, organizationName: "Teszt Kft." });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const csv = await buildContactExport({ format: "csv", contacts, organizationName: "Teszt Kft." });
  assert.ok(csv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
  assert.match(csv.toString("utf8"), /Kovács/);
  assert.match(csv.toString("utf8"), /Minta Kft\./);
});

test("contact CSV export neutralizes spreadsheet formulas", async () => {
  const csv = await buildContactExport({
    format: "csv",
    contacts: [{ ...contacts[0], firstName: "=FORMULA()" }],
    organizationName: "Teszt Kft.",
  });
  assert.match(csv.toString("utf8"), /"'=FORMULA\(\)"/);
});
