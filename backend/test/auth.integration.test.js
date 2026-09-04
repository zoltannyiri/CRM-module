import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../src/lib/prisma.js";

// Opt-in: executes real SQL in DATABASE_URL, rolling back every test row.
// PostgreSQL sequences can advance even though the transaction is rolled back.
test("auth and tenant authorization HTTP integration", {
  skip: process.env.AUTH_DB_TESTS !== "1",
  timeout: 90000,
}, async (t) => {
  let database;
  let savepoint = 0;
  let fixtureOrganizationId;
  const rollback = new Error("Rollback integration fixtures");
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();

  // Route queries use the real Prisma transaction. Nested service transactions
  // use savepoints so failure/rollback behavior is also exercised.
  mock.module("../src/lib/prisma.js", {
    defaultExport: new Proxy({}, {
      get(_target, key) {
        if (key === "$disconnect") return async () => {};
        if (key === "$transaction") return async (callback) => {
          const name = `auth_test_${++savepoint}`;
          await database.$executeRawUnsafe(`SAVEPOINT ${name}`);
          try {
            const value = await callback(database);
            await database.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
            return value;
          } catch (error) {
            await database.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
            throw error;
          }
        };
        return database[key];
      },
    }),
  });

  const { default: authRoutes } = await import("../src/routes/authRoutes.js");
  const { default: partnerRoutes } = await import("../src/routes/partnerRoutes.js");
  const { generateAccessToken, hashRefreshToken, hashInviteToken } = await import("../src/utils/token.js");
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/partners", partnerRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = "GET", token, body, cookie } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(body && { "content-type": "application/json" }),
        ...(cookie && { cookie }),
      },
      body: body && JSON.stringify(body),
    });
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie"),
      body: response.status === 204 ? null : await response.json(),
    };
  };
  const checkToken = (token, userId) => {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "userId"]);
    assert.equal(payload.userId, userId);
    assert.equal(payload.exp - payload.iat, 900);
  };

  try {
    await prisma.$transaction(async (tx) => {
      database = tx;
      const suffix = randomUUID();
      const password = "Integration-password-42";
      const passwordHash = await bcrypt.hash(password, 12);
      const org = await tx.organization.create({ data: { name: "Auth test", slug: `auth-${suffix}` } });
      fixtureOrganizationId = org.id;
      const otherOrg = await tx.organization.create({ data: { name: "Other tenant", slug: `other-${suffix}` } });
      const users = {};
      for (const role of ["OWNER", "ADMIN", "USER", "NONE"]) {
        users[role] = await tx.user.create({ data: {
          email: `${role.toLowerCase()}-${suffix}@example.invalid`, passwordHash, firstName: "Test", lastName: role,
        } });
        if (role !== "NONE") await tx.organizationMember.create({ data: {
          userId: users[role].id, organizationId: org.id, role,
        } });
      }
      // A later membership must not change which organization login and /me use.
      await tx.organizationMember.create({ data: {
        userId: users.OWNER.id, organizationId: otherOrg.id, role: "USER",
      } });
      let ownerToken;
      let refreshCookie;
      await t.test("login, /me and userId-only JWT", async () => {
        const login = await request("/api/auth/login", { method: "POST", body: { email: users.OWNER.email, password } });
        assert.equal(login.status, 200, login.body.message);
        assert.equal(login.body.user.role, "OWNER");
        assert.equal(login.body.user.organizationId, org.id);
        assert.equal(login.body.user.organization.slug, org.slug);
        assert.equal(login.body.user.passwordHash, undefined);
        assert.equal(login.body.refreshToken, undefined);
        assert.match(login.cookie, /HttpOnly/i);
        ownerToken = login.body.accessToken;
        refreshCookie = login.cookie.split(";")[0];
        checkToken(ownerToken, users.OWNER.id);
        const me = await request("/api/auth/me", { token: ownerToken });
        assert.equal(me.status, 200);
        assert.deepEqual(me.body, login.body.user);
        assert.equal((await request("/api/auth/login", { method: "POST", body: { email: users.OWNER.email, password: "wrong" } })).status, 401);
      });

      let invitationToken;
      await t.test("invitation creation accepts no body and defaults to USER", async () => {
        for (const body of [undefined, {}]) {
          const response = await request("/api/auth/invitations", {
            method: "POST", token: ownerToken, body,
          });
          assert.equal(response.status, 201, response.body.message);
          const token = response.body.invitationUrl.split("/").at(-1);
          const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashInviteToken(token) } });
          assert.equal(invitation.role, "USER");
          assert.equal(invitation.email, null);
          assert.equal(invitation.organizationId, org.id);
        }
        assert.equal((await request("/api/auth/invitations", {
          method: "POST", token: generateAccessToken(users.USER),
        })).status, 403);
      });

      await t.test("OWNER/ADMIN can invite; USER and missing membership cannot", async () => {
        for (const role of ["OWNER", "ADMIN", "USER", "NONE"]) {
          const response = await request("/api/auth/invitations", {
            method: "POST", token: generateAccessToken(users[role]), body: { role: "USER", organizationId: otherOrg.id },
          });
          assert.equal(response.status, ["OWNER", "ADMIN"].includes(role) ? 201 : 403);
          if (role === "OWNER") invitationToken = response.body.invitationUrl.split("/").at(-1);
        }
        const invite = await tx.invitation.findUnique({ where: { tokenHash: hashInviteToken(invitationToken) } });
        assert.equal(invite.organizationId, org.id);
        assert.notEqual(invite.tokenHash, invitationToken);
        assert.equal((await request("/api/auth/invitations", { method: "POST", body: {} })).status, 401);
        assert.equal((await request("/api/auth/me", { token: generateAccessToken(users.NONE) })).status, 403);
        const missingId = jwt.sign({ role: "OWNER" }, process.env.JWT_SECRET);
        assert.equal((await request("/api/partners", { token: missingId })).status, 401);
        const forgedRole = jwt.sign({ userId: users.USER.id, role: "OWNER", organizationId: org.id }, process.env.JWT_SECRET);
        assert.equal((await request("/api/auth/invitations", { method: "POST", token: forgedRole, body: {} })).status, 403);
      });

      await t.test("partners CRUD and cross-tenant isolation including mass assignment", async () => {
        const foreign = await tx.partner.create({ data: { organizationId: otherOrg.id, name: "Foreign" } });
        const created = await request("/api/partners", { method: "POST", token: ownerToken, body: { name: "Local", organizationId: otherOrg.id } });
        assert.equal(created.status, 201);
        assert.equal(created.body.organizationId, org.id);
        const id = created.body.id;
        const list = await request("/api/partners", { token: ownerToken });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.map((partner) => partner.id), [id]);
        assert.equal((await request(`/api/partners/${id}`, { token: ownerToken })).status, 200);
        for (const method of ["GET", "PATCH", "DELETE"]) {
          const response = await request(`/api/partners/${foreign.id}`, { method, token: ownerToken, ...(method === "PATCH" && { body: { name: "Intrusion" } }) });
          assert.equal(response.status, 404, method);
        }
        const changed = await request(`/api/partners/${id}`, { method: "PATCH", token: ownerToken, body: {
          name: "Updated", organizationId: otherOrg.id, id: foreign.id,
          organization: { connect: { id: otherOrg.id } }, contacts: { create: { firstName: "Injected", lastName: "Contact" } },
        } });
        assert.equal(changed.status, 200);
        assert.equal(changed.body.id, id);
        assert.equal(changed.body.organizationId, org.id);
        assert.equal(changed.body.name, "Updated");
        assert.deepEqual(changed.body.contacts, []);
        assert.equal((await request(`/api/partners/${id}`, { method: "DELETE", token: ownerToken })).status, 200);
        assert.equal((await request(`/api/partners/${id}`, { token: ownerToken })).status, 404);
        assert.equal((await tx.partner.findUnique({ where: { id: foreign.id } })).name, "Foreign");
      });

      await t.test("invitation registration retains membership and is single use", async () => {
        assert.equal((await request(`/api/auth/invitation/${invitationToken}`)).status, 200);
        const body = { email: `new-${suffix}@example.invalid`, password, firstName: "New", lastName: "Member" };
        const registered = await request(`/api/auth/register/${invitationToken}`, { method: "POST", body });
        assert.equal(registered.status, 201);
        assert.equal(registered.body.user.role, "USER");
        assert.equal(registered.body.user.organizationId, org.id);
        assert.equal(registered.body.user.organization.slug, org.slug);
        checkToken(registered.body.accessToken, registered.body.user.id);
        const user = await tx.user.findUnique({ where: { id: registered.body.user.id }, include: { memberships: true } });
        assert.equal(user.memberships.length, 1);
        assert.equal(user.memberships[0].role, "USER");
        assert.ok(await bcrypt.compare(password, user.passwordHash));
        assert.equal((await request(`/api/auth/register/${invitationToken}`, { method: "POST", body: { ...body, email: `reuse-${suffix}@example.invalid` } })).status, 400);
        assert.equal((await request(`/api/auth/invitation/${invitationToken}`)).status, 400);

        const expiredToken = randomUUID();
        await tx.invitation.create({ data: { organizationId: org.id, tokenHash: hashInviteToken(expiredToken), expiresAt: new Date(0) } });
        assert.equal((await request(`/api/auth/register/${expiredToken}`, { method: "POST", body })).status, 400);
        const boundToken = randomUUID();
        await tx.invitation.create({ data: { organizationId: org.id, email: users.OWNER.email, tokenHash: hashInviteToken(boundToken), expiresAt: new Date(Date.now() + 60000) } });
        assert.equal((await request(`/api/auth/register/${boundToken}`, { method: "POST", body })).status, 400);
        // A failed registration must roll back the invitation claim.
        assert.equal((await request(`/api/auth/register/${boundToken}`, { method: "POST", body: { ...body, email: users.OWNER.email } })).status, 400);
        assert.equal((await tx.invitation.findUnique({ where: { tokenHash: hashInviteToken(boundToken) } })).usedAt, null);
      });

      await t.test("refresh rotation, replay rejection, expiry and logout", async () => {
        const raw = refreshCookie.split("=")[1];
        const session = await tx.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(raw) } });
        assert.ok(session);
        assert.notEqual(session.refreshTokenHash, raw);
        const refreshed = await request("/api/auth/refresh", { method: "POST", cookie: refreshCookie });
        assert.equal(refreshed.status, 200);
        checkToken(refreshed.body.accessToken, users.OWNER.id);
        assert.equal((await request("/api/auth/me", { token: refreshed.body.accessToken })).status, 200);
        assert.equal((await request("/api/auth/refresh", { method: "POST", cookie: refreshCookie })).status, 401);
        const nextCookie = refreshed.cookie.split(";")[0];
        assert.notEqual(nextCookie, refreshCookie);
        assert.equal((await request("/api/auth/logout", { method: "POST", cookie: nextCookie })).status, 204);
        assert.equal((await request("/api/auth/refresh", { method: "POST", cookie: nextCookie })).status, 401);
        for (const dates of [{ expiresAt: new Date(0) }, { createdAt: new Date(0) }]) {
          const token = randomUUID();
          await tx.session.create({ data: { userId: users.OWNER.id, refreshTokenHash: hashRefreshToken(token), ...dates } });
          assert.equal((await request("/api/auth/refresh", { method: "POST", cookie: `refreshToken=${token}` })).status, 401);
        }
      });

      await t.test("admin bootstrap creates OWNER membership and safely reuses it", async () => {
        const keys = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_ORGANIZATION_NAME", "ADMIN_ORGANIZATION_SLUG"];
        const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
        try {
          process.env.ADMIN_EMAIL = `bootstrap-${suffix}@example.invalid`;
          process.env.ADMIN_PASSWORD = password;
          process.env.ADMIN_ORGANIZATION_NAME = "Bootstrap test";
          delete process.env.ADMIN_ORGANIZATION_SLUG;
          await import(`../scripts/createAdmin.js?first=${suffix}`);
          const initial = await tx.user.findUnique({ where: { email: process.env.ADMIN_EMAIL }, include: { memberships: { include: { organization: true } } } });
          assert.equal(initial.memberships.length, 1);
          assert.equal(initial.memberships[0].role, "OWNER");
          assert.ok(initial.memberships[0].organization.slug);
          assert.ok(await bcrypt.compare(password, initial.passwordHash));
          await import(`../scripts/createAdmin.js?repeat=${suffix}`);
          assert.equal(await tx.organizationMember.count({ where: { userId: initial.id } }), 1);
          assert.equal(await tx.organization.count({ where: { name: "Bootstrap test" } }), 1);

          process.env.ADMIN_EMAIL = users.NONE.email;
          process.env.ADMIN_ORGANIZATION_SLUG = org.slug;
          await import(`../scripts/createAdmin.js?existing=${suffix}`);
          const membership = await tx.organizationMember.findUnique({ where: { userId_organizationId: { userId: users.NONE.id, organizationId: org.id } } });
          assert.equal(membership.role, "OWNER");
        } finally {
          for (const key of keys) {
            if (original[key] === undefined) delete process.env[key];
            else process.env[key] = original[key];
          }
        }
      });

      throw rollback;
    }, { timeout: 75000 });
  } catch (error) {
    if (error !== rollback) throw error;
    assert.equal(await prisma.organization.findUnique({ where: { id: fixtureOrganizationId } }), null);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    mock.restoreAll();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    await prisma.$disconnect();
  }
});
