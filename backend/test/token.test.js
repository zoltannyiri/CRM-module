import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { generateAccessToken } from "../src/utils/token.js";

test("access tokens omit legacy tenant/role fields even when supplied", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "local-unit-test-only";
  try {
    const token = generateAccessToken({ id: 42, role: "OWNER", organizationId: 7 });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.deepEqual(Object.keys(decoded).sort(), ["exp", "iat", "userId"]);
    assert.equal(decoded.userId, 42);
    assert.equal(decoded.exp - decoded.iat, 900);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
