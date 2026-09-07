import assert from "node:assert/strict";
import test from "node:test";

import { buildPartnerExport } from "../src/services/partnerExportService.js";

const partners = [{
  id: 1,
  type: "PERSON",
  name: "Nyiri Zoltán",
  email: "zolikaa0@gmail.com",
  phone: "+36702716859",
  website: "zoltannyiri.hu",
  taxNumber: "590031222",
  address: "9300 Csorna, Bem József utca 21.",
  note: "Nagyon jó arc",
  contacts: [{ firstName: "Teszt", lastName: "Kapcsolattartó" }],
}];

test("partner exports create valid XLSX, PDF and CSV files", async () => {
  const xlsx = await buildPartnerExport({ format: "xlsx", partners, organizationName: "Teszt Kft." });
  assert.equal(xlsx.subarray(0, 2).toString(), "PK");

  const pdf = await buildPartnerExport({ format: "pdf", partners, organizationName: "Teszt Kft." });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");

  const csv = await buildPartnerExport({ format: "csv", partners, organizationName: "Teszt Kft." });
  assert.ok(csv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
  assert.match(csv.toString("utf8"), /Nyiri Zoltán/);
  assert.match(csv.toString("utf8"), /Teszt Kapcsolattartó/);
});

test("CSV export neutralizes spreadsheet formulas", async () => {
  const csv = await buildPartnerExport({
    format: "csv",
    partners: [{ ...partners[0], name: "=HYPERLINK(\"https://invalid\")" }],
    organizationName: "Teszt Kft.",
  });
  assert.match(csv.toString("utf8"), /"'=HYPERLINK/);
});
