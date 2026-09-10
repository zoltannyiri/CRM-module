import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateOfferTotals,
  createOffer,
  deleteOffer,
  getOfferById,
  getOffers,
  updateOffer,
} from "../src/services/offerService.js";

const issueDate = new Date("2026-09-10T00:00:00.000Z");
const validUntil = new Date("2026-10-10T00:00:00.000Z");
const inputItems = [{ name: "Tanácsadás", description: null, quantity: "2.5", unit: "óra", unitPrice: "10000", vatRate: "27" }];

function record(overrides = {}) {
  return {
    id: 1,
    organizationId: 42,
    offerNumber: "AJ-2026-0001",
    partnerId: 10,
    projectId: 20,
    status: "DRAFT",
    issueDate,
    validUntil,
    currency: "HUF",
    note: null,
    createdAt: issueDate,
    updatedAt: issueDate,
    createdByMember: null,
    items: [{ id: 1, ...inputItems[0], position: 1 }],
    ...overrides,
  };
}

function accessClient({ partnerExists = true, projectExists = true, permissions = ["PARTNERS_VIEW", "PROJECTS_VIEW"] } = {}) {
  return {
    organizationModule: { findMany: async () => [{ module: "PARTNERS" }, { module: "PROJECTS" }, { module: "OFFERS" }] },
    organizationMemberPermission: { findMany: async () => permissions.map((permission) => ({ permission })) },
    partner: {
      findFirst: async ({ where }) => partnerExists && where.organizationId === 42 && where.id === 10 ? { id: 10 } : null,
      findMany: async ({ where }) => where.organizationId === 42 ? [{ id: 10, name: "Minta Kft." }] : [],
    },
    project: {
      findFirst: async ({ where }) => projectExists && where.organizationId === 42 && where.id === 20 ? { id: 20 } : null,
      findMany: async ({ where }) => where.organizationId === 42 ? [{ id: 20, name: "Bevezetés" }] : [],
    },
  };
}

test("OfferItem calculation uses decimal arithmetic for net, VAT and gross totals", () => {
  const calculated = calculateOfferTotals([
    { quantity: "0.1", unitPrice: "0.2", vatRate: "27" },
    { quantity: "3", unitPrice: "100.10", vatRate: "5" },
  ]);
  assert.deepEqual(calculated.totals, { net: "300.32", vat: "15.03", gross: "315.35" });
  assert.equal(calculated.items[0].netAmount, "0.02");
  assert.equal(calculated.items[0].grossAmount, "0.03");
});

test("createOffer creates items, activity and collision-free organization scoped numbers", async () => {
  let lastNumber = 0;
  const createdNumbers = [];
  const activities = [];
  const client = accessClient();
  client.$transaction = async (callback) => callback(client);
  client.offerSequence = { upsert: async ({ where }) => {
    assert.equal(where.organizationId_year.organizationId, 42);
    lastNumber += 1;
    return { lastNumber };
  } };
  client.offer = { create: async ({ data }) => {
    createdNumbers.push(data.offerNumber);
    return record({ id: createdNumbers.length, offerNumber: data.offerNumber, items: data.items.create.map((item, index) => ({ id: index + 1, ...item })) });
  } };
  client.activity = { create: async ({ data }) => { activities.push(data); return data; } };
  const args = { organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, data: { partnerId: 10, projectId: 20, status: "DRAFT", issueDate, validUntil, currency: "HUF", note: null, items: inputItems } };

  await Promise.all([createOffer(args, client), createOffer(args, client)]);
  assert.deepEqual(createdNumbers, ["AJ-2026-0001", "AJ-2026-0002"]);
  assert.equal(new Set(createdNumbers).size, 2);
  assert.equal(activities.length, 2);
  assert.ok(activities.every(({ entityType, action }) => entityType === "OFFER" && action === "CREATED"));
});

test("createOffer rejects cross-tenant partner and project relations", async () => {
  const makeClient = (options) => {
    const client = accessClient(options);
    client.$transaction = async (callback) => callback(client);
    return client;
  };
  const args = { organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, data: { partnerId: 10, projectId: 20, status: "DRAFT", issueDate, validUntil, currency: "HUF", note: null, items: inputItems } };
  await assert.rejects(createOffer(args, makeClient({ partnerExists: false })), (error) => error.statusCode === 404 && /partner/i.test(error.message));
  await assert.rejects(createOffer(args, makeClient({ projectExists: false })), (error) => error.statusCode === 404 && /projekt/i.test(error.message));
});

test("createOffer requires permission to view linked partner data", async () => {
  const client = accessClient({ permissions: [] });
  client.$transaction = async (callback) => callback(client);
  const args = { organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, data: { partnerId: 10, projectId: null, status: "DRAFT", issueDate, validUntil, currency: "HUF", note: null, items: inputItems } };
  await assert.rejects(createOffer(args, client), (error) => error.statusCode === 403 && error.permission === "PARTNERS_VIEW");
});

test("list and show are tenant scoped and hide relations without their view permissions", async () => {
  const client = accessClient({ permissions: [] });
  const queries = [];
  client.offer = {
    findMany: async (args) => { queries.push(args); return [record()]; },
    findFirst: async ({ where }) => where.organizationId === 42 ? record() : null,
  };
  const membership = { id: 5, role: "USER" };
  const offers = await getOffers({ organizationId: 42, membership }, client);
  assert.equal(queries[0].where.organizationId, 42);
  assert.equal(offers[0].partner, null);
  assert.equal(offers[0].project, null);
  assert.equal(offers[0].partnerId, undefined);
  assert.equal(await getOfferById({ organizationId: 99, membership, offerId: 1 }, client), null);
});

test("update and delete do not mutate another tenant offer", async () => {
  let mutated = false;
  const client = accessClient();
  client.$transaction = async (callback) => callback(client);
  client.offer = {
    findFirst: async ({ where }) => where.organizationId === 42 ? record() : null,
    update: async () => { mutated = true; },
    deleteMany: async () => { mutated = true; return { count: 1 }; },
  };
  const membership = { id: 5, role: "USER" };
  assert.equal(await updateOffer({ organizationId: 99, membership, actorMemberId: 5, offerId: 1, data: { note: "x" } }, client), null);
  assert.equal(await deleteOffer({ organizationId: 99, actorMemberId: 5, offerId: 1 }, client), false);
  assert.equal(mutated, false);
});

test("update preserves hidden project when projectId is omitted", async () => {
  const client = accessClient({ permissions: ["PARTNERS_VIEW"] });
  client.$transaction = async (callback) => callback(client);
  client.offer = {
    findFirst: async () => record(),
    update: async ({ data }) => {
      assert.equal(Object.hasOwn(data, "projectId"), false);
      return record({ note: data.note });
    },
  };
  client.activity = { create: async ({ data }) => data };
  const updated = await updateOffer({ organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, offerId: 1, data: { note: "Megőrzött kapcsolat" } }, client);
  assert.equal(updated.note, "Megőrzött kapcsolat");
  assert.equal(updated.project, null);
});

test("delete removes a tenant-owned offer and records activity", async () => {
  const activities = [];
  const client = accessClient();
  client.$transaction = async (callback) => callback(client);
  client.offer = {
    findFirst: async ({ where }) => where.organizationId === 42 ? { id: 1, offerNumber: "AJ-2026-0001" } : null,
    deleteMany: async ({ where }) => ({ count: where.organizationId === 42 && where.id === 1 ? 1 : 0 }),
  };
  client.activity = { create: async ({ data }) => { activities.push(data); return data; } };

  assert.equal(await deleteOffer({ organizationId: 42, actorMemberId: 5, offerId: 1 }, client), true);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].entityType, "OFFER");
  assert.equal(activities[0].action, "DELETED");
});
