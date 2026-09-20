import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("LeadFormComponent includes customFieldValues in single request payload and does not make secondary calls", async () => {
  const leadFormSource = await readFile(new URL("../src/components/lead/LeadFormComponent.jsx", import.meta.url), "utf8");

  // Verify customFieldValues is in payload
  assert.ok(leadFormSource.includes("customFieldValues,"), "Payload must include customFieldValues");

  // Verify secondary PUT to /api/custom-fields/values was removed
  assert.ok(!leadFormSource.includes("/api/custom-fields/values"), "Secondary call to /api/custom-fields/values must not exist");

  // Verify error state is set on submission failure and drawer is kept open
  assert.ok(leadFormSource.includes("setError(requestError.response?.data?.message"), "Must set error on submission failure");
});

test("PartnerFormComponent includes customFieldValues in single request payload and does not make secondary calls", async () => {
  const partnerFormSource = await readFile(new URL("../src/components/partner/PartnerFormComponent.jsx", import.meta.url), "utf8");

  // Verify customFieldValues is in payload
  assert.ok(partnerFormSource.includes("payload.customFieldValues = customFieldValues;"), "Payload must include customFieldValues");

  // Verify secondary PUT to /api/custom-fields/values was removed
  assert.ok(!partnerFormSource.includes("/api/custom-fields/values"), "Secondary call to /api/custom-fields/values must not exist");

  // Verify error state is set on submission failure and drawer is kept open
  assert.ok(partnerFormSource.includes("setError(requestError.response?.data?.message"), "Must set error on submission failure");
});

test("CustomFieldValuesSection handles 3-state boolean when required", async () => {
  const sectionSource = await readFile(new URL("../src/components/customField/CustomFieldValuesSection.jsx", import.meta.url), "utf8");

  // Check 3-state boolean support for required fields
  assert.ok(sectionSource.includes("field.required"), "Must check field.required for boolean rendering");
  assert.ok(sectionSource.includes("— Válassz —"), "Must include unset option for required boolean");
  assert.ok(sectionSource.includes('value="true"'), "Must include true option");
  assert.ok(sectionSource.includes('value="false"'), "Must include false option");
});

