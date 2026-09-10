import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PermissionKey } from "@prisma/client";
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
  const { default: contactRoutes } = await import("../src/routes/contactRoutes.js");
  const { default: partnerRoutes } = await import("../src/routes/partnerRoutes.js");
  const { default: projectRoutes } = await import("../src/routes/projectRoutes.js");
  const { default: taskRoutes } = await import("../src/routes/taskRoutes.js");
  const { default: activityRoutes } = await import("../src/routes/activityRoutes.js");
  const { default: memberRoutes } = await import("../src/routes/memberRoutes.js");
  const { default: dashboardRoutes } = await import("../src/routes/dashboardRoutes.js");
  const { default: requireModule } = await import("../src/middleware/requireModule.js");
  const { generateAccessToken, hashRefreshToken, hashInviteToken } = await import("../src/utils/token.js");
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/contacts", contactRoutes);
  app.use("/api/partners", partnerRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/members", memberRoutes);
  app.use("/api/dashboard", dashboardRoutes);
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
    const contentType = response.headers.get("content-type") || "";
    let responseBody = null;
    if (response.status !== 204) {
      responseBody = contentType.includes("application/json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer());
    }
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie"),
      contentType,
      disposition: response.headers.get("content-disposition"),
      body: responseBody,
    };
  };
  const checkToken = (token, userId) => {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "userId"]);
    assert.equal(payload.userId, userId);
    assert.equal(payload.exp - payload.iat, 1800);
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
      await tx.organizationModule.createMany({ data: [org.id, otherOrg.id].flatMap((organizationId) =>
        ["PARTNERS", "PROJECTS", "TASKS"].map((module) => ({ organizationId, module, enabled: true })),
      ) });
      const users = {};
      const memberships = {};
      for (const role of ["OWNER", "ADMIN", "USER", "NONE"]) {
        users[role] = await tx.user.create({ data: {
          email: `${role.toLowerCase()}-${suffix}@example.invalid`, passwordHash, firstName: "Test", lastName: role,
        } });
        if (role !== "NONE") memberships[role] = await tx.organizationMember.create({ data: {
          userId: users[role].id, organizationId: org.id, role,
        } });
      }
      await tx.organizationMemberPermission.createMany({
        data: ["ADMIN", "USER"].flatMap((role) => Object.values(PermissionKey).map((permission) => ({
          organizationMemberId: memberships[role].id, permission,
        }))),
      });
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
        assert.deepEqual(login.body.modules, ["PARTNERS", "PROJECTS", "TASKS"]);
        assert.deepEqual(new Set(login.body.permissions), new Set(Object.values(PermissionKey)));
        assert.equal(login.body.user.passwordHash, undefined);
        assert.equal(login.body.refreshToken, undefined);
        assert.match(login.cookie, /HttpOnly/i);
        assert.match(login.cookie, /Path=\/api\/auth/i);
        assert.match(login.cookie, /SameSite=Lax/i);
        ownerToken = login.body.accessToken;
        refreshCookie = login.cookie.split(";")[0];
        checkToken(ownerToken, users.OWNER.id);
        const me = await request("/api/auth/me", { token: ownerToken });
        assert.equal(me.status, 200);
        assert.deepEqual(me.body.user, login.body.user);
        assert.deepEqual(me.body.modules, login.body.modules);
        assert.deepEqual(new Set(me.body.permissions), new Set(Object.values(PermissionKey)));
        assert.equal((await request("/api/auth/login", { method: "POST", body: { email: users.OWNER.email, password: "wrong" } })).status, 401);
      });

      await t.test("organization module gates deny missing or disabled modules without affecting other tenants or core activity", async () => {
        assert.throws(() => requireModule("NOT_A_MODULE"), /Érvénytelen ModuleKey konfiguráció/);
        assert.equal((await request("/api/partners", { token: ownerToken })).status, 200);
        assert.equal((await request("/api/projects", { token: ownerToken })).status, 200);
        assert.equal((await request("/api/tasks", { token: ownerToken })).status, 200);

        await tx.organizationModule.update({
          where: { organizationId_module: { organizationId: org.id, module: "PROJECTS" } },
          data: { enabled: false },
        });
        const disabledProject = await request("/api/projects", { token: ownerToken });
        assert.equal(disabledProject.status, 403);
        assert.deepEqual(disabledProject.body, {
          message: "Ez a modul nincs engedélyezve a szervezet számára.",
          code: "MODULE_DISABLED",
          module: "PROJECTS",
        });
        assert.equal((await request("/api/partners", { token: ownerToken })).status, 200);
        assert.equal((await request("/api/activities", { token: ownerToken })).status, 200);
        await tx.organizationModule.update({
          where: { organizationId_module: { organizationId: org.id, module: "PROJECTS" } },
          data: { enabled: true },
        });

        await tx.organizationModule.update({
          where: { organizationId_module: { organizationId: otherOrg.id, module: "PROJECTS" } },
          data: { enabled: false },
        });
        assert.equal((await request("/api/projects", { token: ownerToken })).status, 200);

        await tx.organizationModule.update({
          where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } },
          data: { enabled: false },
        });
        assert.equal((await request("/api/partners", { token: ownerToken })).status, 403);
        assert.equal((await request("/api/contacts", { token: ownerToken })).status, 403);
        await tx.organizationModule.update({
          where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } },
          data: { enabled: true },
        });

        await tx.organizationModule.delete({
          where: { organizationId_module: { organizationId: org.id, module: "TASKS" } },
        });
        assert.equal((await request("/api/tasks", { token: ownerToken })).status, 403);
        assert.equal((await request("/api/projects", { token: ownerToken })).status, 200);
        await tx.organizationModule.create({ data: { organizationId: org.id, module: "TASKS", enabled: true } });

        const me = await request("/api/auth/me", { token: ownerToken });
        assert.deepEqual(me.body.modules, ["PARTNERS", "PROJECTS", "TASKS"]);
      });

      await t.test("permission middleware, OWNER bypass and TASKS_ASSIGN are enforced", async () => {
        const userToken = generateAccessToken(users.USER);
        await tx.organizationMemberPermission.deleteMany({ where: { organizationMemberId: memberships.USER.id } });
        await tx.organizationMemberPermission.createMany({ data: ["PARTNERS_VIEW", "TASKS_EDIT"].map((permission) => ({ organizationMemberId: memberships.USER.id, permission })) });

        assert.equal((await request("/api/partners", { token: userToken })).status, 200);
        for (const [method, path, body] of [["POST", "/api/partners", { name: "Denied" }], ["PATCH", "/api/partners/1", { name: "Denied" }], ["DELETE", "/api/partners/1"]]) {
          const denied = await request(path, { method, token: userToken, body });
          assert.equal(denied.status, 403);
          assert.equal(denied.body.code, "PERMISSION_DENIED");
        }
        assert.equal((await request("/api/projects", { token: userToken })).status, 403);
        assert.equal((await request("/api/tasks", { token: userToken })).status, 403);
        assert.equal((await request("/api/activities", { token: userToken })).status, 403);

        const task = await tx.task.create({ data: { organizationId: org.id, title: "Permission test" } });
        assert.equal((await request(`/api/tasks/${task.id}`, { method: "PATCH", token: userToken, body: { title: "Allowed edit" } })).status, 200);
        const assignDenied = await request(`/api/tasks/${task.id}`, { method: "PATCH", token: userToken, body: { assigneeMemberId: memberships.ADMIN.id } });
        assert.equal(assignDenied.status, 403);
        assert.equal(assignDenied.body.permission, "TASKS_ASSIGN");
        assert.equal((await request("/api/activities", { token: ownerToken })).status, 200);

        await tx.organizationMemberPermission.createMany({
          data: Object.values(PermissionKey).map((permission) => ({ organizationMemberId: memberships.USER.id, permission })),
          skipDuplicates: true,
        });
      });

      await t.test("permission administration replaces sets and prevents privilege escalation", async () => {
        const adminToken = generateAccessToken(users.ADMIN);
        const ownerUpdate = await request(`/api/members/${memberships.USER.id}/permissions`, { method: "PATCH", token: ownerToken, body: { permissions: ["PARTNERS_VIEW"] } });
        assert.equal(ownerUpdate.status, 200);
        assert.deepEqual(ownerUpdate.body.permissions, ["PARTNERS_VIEW"]);
        assert.deepEqual((await request(`/api/members/${memberships.USER.id}/permissions`, { token: ownerToken })).body.permissions, ["PARTNERS_VIEW"]);

        await tx.organizationMemberPermission.deleteMany({ where: { organizationMemberId: memberships.ADMIN.id } });
        await tx.organizationMemberPermission.create({ data: { organizationMemberId: memberships.ADMIN.id, permission: "PARTNERS_VIEW" } });
        assert.equal((await request(`/api/members/${memberships.USER.id}/permissions`, { method: "PATCH", token: adminToken, body: { permissions: ["PARTNERS_VIEW"] } })).status, 200);
        assert.equal((await request(`/api/members/${memberships.USER.id}/permissions`, { method: "PATCH", token: adminToken, body: { permissions: ["PROJECTS_VIEW"] } })).status, 403);
        assert.equal((await request(`/api/members/${memberships.ADMIN.id}/permissions`, { method: "PATCH", token: adminToken, body: { permissions: [] } })).status, 403);
        assert.equal((await request(`/api/members/${memberships.OWNER.id}/permissions`, { method: "PATCH", token: adminToken, body: { permissions: [] } })).status, 403);
        assert.equal((await request(`/api/members/${memberships.OWNER.id}/permissions`, { method: "PATCH", token: ownerToken, body: { permissions: [] } })).status, 403);
        const foreignMembership = await tx.organizationMember.findFirst({ where: { organizationId: otherOrg.id } });
        assert.equal((await request(`/api/members/${foreignMembership.id}/permissions`, { token: ownerToken })).status, 404);

        await tx.organizationMemberPermission.createMany({ data: [memberships.ADMIN.id, memberships.USER.id].flatMap((organizationMemberId) => Object.values(PermissionKey).map((permission) => ({ organizationMemberId, permission }))), skipDuplicates: true });
      });

      await t.test("dashboard aggregates only tenant, module and permission allowed data", async () => {
        const now = new Date();
        const inSevenDays = new Date(now); inSevenDays.setUTCDate(inSevenDays.getUTCDate() + 7);
        const inThirtyDays = new Date(now); inThirtyDays.setUTCDate(inThirtyDays.getUTCDate() + 30);
        const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const activeProject = await tx.project.create({ data: { organizationId: org.id, name: "Dashboard project", status: "ACTIVE", deadline: inSevenDays } });
        await tx.project.create({ data: { organizationId: org.id, name: "Far project", status: "ACTIVE", deadline: inThirtyDays } });
        await tx.task.create({ data: { organizationId: org.id, projectId: activeProject.id, assigneeMemberId: memberships.OWNER.id, title: "My open task", status: "TODO", dueDate: inSevenDays } });
        await tx.task.create({ data: { organizationId: org.id, assigneeMemberId: memberships.ADMIN.id, title: "Other task", status: "TODO", dueDate: yesterday } });
        await tx.task.create({ data: { organizationId: org.id, assigneeMemberId: memberships.OWNER.id, title: "Done old task", status: "DONE", dueDate: yesterday } });
        await tx.activity.create({ data: { organizationId: org.id, actorMemberId: memberships.OWNER.id, entityType: "PROJECT", entityId: activeProject.id, action: "CREATED", title: "Dashboard activity" } });
        await tx.partner.create({ data: { organizationId: otherOrg.id, name: "Foreign dashboard partner" } });

        const ownerDashboard = await request("/api/dashboard", { token: ownerToken });
        assert.equal(ownerDashboard.status, 200);
        assert.deepEqual(ownerDashboard.body.stats.map(({ key }) => key), ["partners", "activeProjects", "openTasks", "overdueTasks"]);
        assert.deepEqual(ownerDashboard.body.myTasks.map(({ title }) => title), ["My open task"]);
        assert.deepEqual(ownerDashboard.body.upcomingDeadlines.map(({ title }) => title).sort(), ["Dashboard project", "My open task"].sort());
        assert.equal(ownerDashboard.body.recentActivities[0].title, "Dashboard activity");
        assert.equal(ownerDashboard.body.stats.find(({ key }) => key === "overdueTasks").value, 1);

        await tx.organizationMemberPermission.deleteMany({ where: { organizationMemberId: memberships.USER.id } });
        await tx.organizationMemberPermission.create({ data: { organizationMemberId: memberships.USER.id, permission: "PARTNERS_VIEW" } });
        const restricted = await request("/api/dashboard", { token: generateAccessToken(users.USER) });
        assert.deepEqual(restricted.body.stats.map(({ key }) => key), ["partners"]);
        assert.equal("myTasks" in restricted.body, false);
        assert.equal("upcomingDeadlines" in restricted.body, false);
        assert.equal("recentActivities" in restricted.body, false);

        await tx.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } }, data: { enabled: false } });
        assert.deepEqual((await request("/api/dashboard", { token: generateAccessToken(users.USER) })).body.stats, []);
        await tx.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } }, data: { enabled: true } });
        await tx.organizationMemberPermission.createMany({ data: Object.values(PermissionKey).map((permission) => ({ organizationMemberId: memberships.USER.id, permission })), skipDuplicates: true });
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
        const localContact = await tx.contact.create({ data: { partnerId: id, firstName: "Local", lastName: "Contact" } });
        await tx.contact.create({ data: { partnerId: foreign.id, firstName: "Foreign", lastName: "Contact" } });
        const list = await request("/api/partners", { token: ownerToken });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.map((partner) => partner.id), [id]);
        const contacts = await request("/api/contacts", { token: ownerToken });
        assert.equal(contacts.status, 200);
        assert.deepEqual(contacts.body.map((contact) => contact.id), [localContact.id]);
        assert.equal(contacts.body[0].partner.name, "Local");
        assert.equal((await request("/api/contacts")).status, 401);
        const csvExport = await request("/api/partners/export?format=csv", { token: ownerToken });
        assert.equal(csvExport.status, 200);
        assert.match(csvExport.contentType, /text\/csv/);
        assert.match(csvExport.disposition, /attachment; filename="partnerek-/);
        assert.match(csvExport.body.toString("utf8"), /Local/);
        assert.doesNotMatch(csvExport.body.toString("utf8"), /Foreign/);
        for (const [format, signature] of [["xlsx", "PK"], ["pdf", "%PDF"]]) {
          const exported = await request(`/api/partners/export?format=${format}`, { token: ownerToken });
          assert.equal(exported.status, 200, format);
          assert.equal(exported.body.subarray(0, signature.length).toString(), signature);
        }
        assert.equal((await request("/api/partners/export?format=xml", { token: ownerToken })).status, 400);
        assert.equal((await request("/api/partners/export?format=csv")).status, 401);
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
        assert.deepEqual(changed.body.contacts.map((contact) => contact.id), [localContact.id]);
        assert.equal(await tx.contact.count({ where: { partnerId: id } }), 1);
        assert.equal((await request(`/api/partners/${id}`, { method: "DELETE", token: ownerToken })).status, 200);
        assert.equal((await request(`/api/partners/${id}`, { token: ownerToken })).status, 404);
        assert.equal((await tx.partner.findUnique({ where: { id: foreign.id } })).name, "Foreign");
      });

      await t.test("contacts CRUD remains isolated through the owning partner", async () => {
        const localPartner = await tx.partner.create({ data: { organizationId: org.id, name: "Local contact company" } });
        const foreignPartner = await tx.partner.create({ data: { organizationId: otherOrg.id, name: "Foreign contact company" } });
        const foreignContact = await tx.contact.create({ data: { partnerId: foreignPartner.id, firstName: "Foreign", lastName: "Person" } });
        const created = await request("/api/contacts", { method: "POST", token: ownerToken, body: {
          partnerId: localPartner.id, firstName: "Anna", lastName: "Kovács", position: "Ügyvezető",
          organizationId: otherOrg.id, id: foreignContact.id,
        } });
        assert.equal(created.status, 201);
        assert.equal(created.body.partnerId, localPartner.id);
        assert.equal(created.body.partner.name, localPartner.name);
        const contactId = created.body.id;

        assert.equal((await request("/api/contacts", { method: "POST", token: ownerToken, body: {
          partnerId: foreignPartner.id, firstName: "Intrusion", lastName: "Attempt",
        } })).status, 404);
        const list = await request("/api/contacts", { token: ownerToken });
        assert.deepEqual(list.body.map((contact) => contact.id), [contactId]);
        const otherLocalPartner = await tx.partner.create({ data: { organizationId: org.id, name: "Second local company" } });
        const otherLocalContact = await tx.contact.create({ data: { partnerId: otherLocalPartner.id, firstName: "Béla", lastName: "Másik" } });
        const filtered = await request(`/api/contacts?partnerId=${localPartner.id}`, { token: ownerToken });
        assert.deepEqual(filtered.body.map((contact) => contact.id), [contactId]);
        const otherFiltered = await request(`/api/contacts?partnerId=${otherLocalPartner.id}`, { token: ownerToken });
        assert.deepEqual(otherFiltered.body.map((contact) => contact.id), [otherLocalContact.id]);
        const foreignFiltered = await request(`/api/contacts?partnerId=${foreignPartner.id}`, { token: ownerToken });
        assert.deepEqual(foreignFiltered.body, []);
        for (const invalidPartnerId of ["abc", "0", "-1", "1.5"]) {
          assert.equal((await request(`/api/contacts?partnerId=${invalidPartnerId}`, { token: ownerToken })).status, 400);
        }
        const csvExport = await request("/api/contacts/export?format=csv", { token: ownerToken });
        assert.equal(csvExport.status, 200);
        assert.match(csvExport.contentType, /text\/csv/);
        assert.match(csvExport.body.toString("utf8"), /Kovács/);
        assert.doesNotMatch(csvExport.body.toString("utf8"), /Foreign/);
        for (const [format, signature] of [["xlsx", "PK"], ["pdf", "%PDF"]]) {
          const exported = await request(`/api/contacts/export?format=${format}`, { token: ownerToken });
          assert.equal(exported.status, 200, format);
          assert.equal(exported.body.subarray(0, signature.length).toString(), signature);
        }
        assert.equal((await request("/api/contacts/export?format=xml", { token: ownerToken })).status, 400);
        assert.equal((await request(`/api/contacts/${foreignContact.id}`, { token: ownerToken })).status, 404);
        assert.equal((await request(`/api/contacts/${foreignContact.id}`, { method: "DELETE", token: ownerToken })).status, 404);
        assert.equal((await request(`/api/contacts/${contactId}`, { method: "PATCH", token: ownerToken, body: {
          partnerId: foreignPartner.id, firstName: "Moved", lastName: "Outside",
        } })).status, 404);

        const updated = await request(`/api/contacts/${contactId}`, { method: "PATCH", token: ownerToken, body: {
          partnerId: localPartner.id, firstName: "Anna", lastName: "Nagy", email: "anna@example.invalid",
        } });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.lastName, "Nagy");
        assert.equal(updated.body.email, "anna@example.invalid");
        assert.equal((await request(`/api/contacts/${contactId}`, { method: "DELETE", token: ownerToken })).status, 200);
        assert.equal((await request(`/api/contacts/${contactId}`, { token: ownerToken })).status, 404);
        assert.ok(await tx.contact.findUnique({ where: { id: foreignContact.id } }));
      });

      await t.test("projects CRUD, filters and partner assignment remain tenant isolated", async () => {
        const localPartner = await tx.partner.create({ data: { organizationId: org.id, name: "Project customer" } });
        const foreignPartner = await tx.partner.create({ data: { organizationId: otherOrg.id, name: "Foreign project customer" } });
        const foreignProject = await tx.project.create({ data: {
          organizationId: otherOrg.id, partnerId: foreignPartner.id, name: "Foreign project", status: "ACTIVE",
        } });

        const created = await request("/api/projects", { method: "POST", token: ownerToken, body: {
          name: "Local rollout", description: "CRM bevezetés", partnerId: localPartner.id,
          status: "ACTIVE", startDate: "2026-09-10", deadline: "2026-10-15",
          organizationId: otherOrg.id, id: foreignProject.id,
        } });
        assert.equal(created.status, 201, created.body.message);
        assert.equal(created.body.organizationId, org.id);
        assert.equal(created.body.partnerId, localPartner.id);
        assert.equal(created.body.partner.name, localPartner.name);
        const projectId = created.body.id;

        assert.equal((await request("/api/projects")).status, 401);
        assert.equal((await request("/api/projects", { method: "POST", token: ownerToken, body: {
          name: "Intrusion", partnerId: foreignPartner.id,
        } })).status, 404);
        assert.equal((await request("/api/projects", { method: "POST", token: ownerToken, body: {
          name: "Invalid dates", startDate: "2026-10-01", deadline: "2026-09-01",
        } })).status, 400);
        assert.equal((await request("/api/projects?status=UNKNOWN", { token: ownerToken })).status, 400);
        assert.equal((await request("/api/projects?partnerId=abc", { token: ownerToken })).status, 400);

        const list = await request("/api/projects?q=rollout&status=ACTIVE&sortDirection=asc", { token: ownerToken });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.map((project) => project.id), [projectId]);
        const filtered = await request(`/api/projects?partnerId=${localPartner.id}`, { token: ownerToken });
        assert.deepEqual(filtered.body.map((project) => project.id), [projectId]);
        assert.deepEqual((await request(`/api/projects?partnerId=${foreignPartner.id}`, { token: ownerToken })).body, []);

        assert.equal((await request(`/api/projects/${projectId}`, { token: ownerToken })).status, 200);
        for (const method of ["GET", "PATCH", "DELETE"]) {
          const response = await request(`/api/projects/${foreignProject.id}`, {
            method, token: ownerToken, ...(method === "PATCH" && { body: { name: "Intrusion" } }),
          });
          assert.equal(response.status, 404, method);
        }
        assert.equal((await request(`/api/projects/${projectId}`, { method: "PATCH", token: ownerToken, body: {
          partnerId: foreignPartner.id,
        } })).status, 404);
        assert.equal((await request(`/api/projects/${projectId}`, { method: "PATCH", token: ownerToken, body: {
          startDate: "2026-11-01",
        } })).status, 400);

        const updated = await request(`/api/projects/${projectId}`, { method: "PATCH", token: ownerToken, body: {
          name: "Local rollout 2", status: "ON_HOLD", partnerId: null,
          organizationId: otherOrg.id, organization: { connect: { id: otherOrg.id } },
        } });
        assert.equal(updated.status, 200, updated.body.message);
        assert.equal(updated.body.name, "Local rollout 2");
        assert.equal(updated.body.status, "ON_HOLD");
        assert.equal(updated.body.partnerId, null);
        assert.equal(updated.body.organizationId, org.id);

        assert.equal((await request(`/api/projects/${projectId}`, { method: "DELETE", token: ownerToken })).status, 200);
        assert.equal((await request(`/api/projects/${projectId}`, { token: ownerToken })).status, 404);
        assert.equal((await tx.project.findUnique({ where: { id: foreignProject.id } })).name, "Foreign project");
      });

      await t.test("invitation registration retains membership and is single use", async () => {
        assert.equal((await request(`/api/auth/invitation/${invitationToken}`)).status, 200);
        const body = { email: `new-${suffix}@example.invalid`, password, firstName: "New", lastName: "Member" };
        const registered = await request(`/api/auth/register/${invitationToken}`, { method: "POST", body });
        assert.equal(registered.status, 201);
        assert.equal(registered.body.user.role, "USER");
        assert.equal(registered.body.user.organizationId, org.id);
        assert.equal(registered.body.user.organization.slug, org.slug);
        assert.deepEqual(registered.body.modules, ["PARTNERS", "PROJECTS", "TASKS"]);
        assert.deepEqual(new Set(registered.body.permissions), new Set(Object.values(PermissionKey)));
        checkToken(registered.body.accessToken, registered.body.user.id);
        const user = await tx.user.findUnique({ where: { id: registered.body.user.id }, include: { memberships: true } });
        assert.equal(user.memberships.length, 1);
        assert.equal(user.memberships[0].role, "USER");
        assert.equal(await tx.organizationMemberPermission.count({ where: { organizationMemberId: user.memberships[0].id } }), Object.values(PermissionKey).length);
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
        assert.ok(session.expiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000);
        const refreshed = await request("/api/auth/refresh", { method: "POST", cookie: refreshCookie });
        assert.equal(refreshed.status, 200);
        checkToken(refreshed.body.accessToken, users.OWNER.id);
        assert.equal((await request("/api/auth/me", { token: refreshed.body.accessToken })).status, 200);
        assert.equal((await request("/api/auth/refresh", { method: "POST", cookie: refreshCookie })).status, 401);
        const nextCookie = refreshed.cookie.split(";")[0];
        assert.notEqual(nextCookie, refreshCookie);
        const logout = await request("/api/auth/logout", { method: "POST", cookie: nextCookie });
        assert.equal(logout.status, 200);
        assert.equal(logout.body.message, "Sikeres kijelentkezés.");
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
          const defaultModules = await tx.organizationModule.findMany({
            where: { organizationId: initial.memberships[0].organizationId, enabled: true },
            select: { module: true },
            orderBy: { id: "asc" },
          });
          assert.deepEqual(defaultModules.map(({ module }) => module), ["PARTNERS", "PROJECTS", "TASKS"]);
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
