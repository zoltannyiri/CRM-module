import prisma from "../lib/prisma.js";
import { getEnabledModules } from "./organizationModuleService.js";
import { getEffectivePermissions } from "./permissionService.js";
import { getAllowedActivityEntityTypes } from "./activityService.js";

const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"];
const UPCOMING_PROJECT_STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD"];

function utcDayWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 15);
  return { start, endExclusive };
}

export async function getDashboard({ organizationId, membership, now = new Date() }) {
  const [enabledModules, effectivePermissions] = await Promise.all([
    getEnabledModules(organizationId),
    getEffectivePermissions(membership),
  ]);
  const modules = new Set(enabledModules);
  const permissions = new Set(effectivePermissions);
  const canPartners = modules.has("PARTNERS") && permissions.has("PARTNERS_VIEW");
  const canProjects = modules.has("PROJECTS") && permissions.has("PROJECTS_VIEW");
  const canTasks = modules.has("TASKS") && permissions.has("TASKS_VIEW");
  const canActivity = permissions.has("ACTIVITY_VIEW");
  const { start, endExclusive } = utcDayWindow(now);

  const allowedActivityEntityTypes = getAllowedActivityEntityTypes({
    enabledModules,
    permissions: effectivePermissions,
  });

  const [partnerCount, activeProjectCount, openTaskCount, overdueTaskCount, myTasks, projectDeadlines, taskDeadlines, recentActivities] = await Promise.all([
    canPartners ? prisma.partner.count({ where: { organizationId } }) : null,
    canProjects ? prisma.project.count({ where: { organizationId, status: "ACTIVE" } }) : null,
    canTasks ? prisma.task.count({ where: { organizationId, status: { in: OPEN_TASK_STATUSES } } }) : null,
    canTasks ? prisma.task.count({ where: { organizationId, status: { in: OPEN_TASK_STATUSES }, dueDate: { lt: start } } }) : null,
    canTasks ? prisma.task.findMany({
      where: { organizationId, assigneeMemberId: membership.id, status: { in: OPEN_TASK_STATUSES } },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true,
        ...(canProjects && { project: { select: { id: true, name: true } } }),
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 5,
    }) : [],
    canProjects ? prisma.project.findMany({
      where: { organizationId, status: { in: UPCOMING_PROJECT_STATUSES }, deadline: { gte: start, lt: endExclusive } },
      select: { id: true, name: true, deadline: true, status: true },
      orderBy: { deadline: "asc" },
      take: 8,
    }) : [],
    canTasks ? prisma.task.findMany({
      where: { organizationId, status: { in: OPEN_TASK_STATUSES }, dueDate: { gte: start, lt: endExclusive } },
      select: { id: true, title: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }) : [],
    (canActivity && allowedActivityEntityTypes.length > 0) ? prisma.activity.findMany({
      where: {
        organizationId,
        entityType: { in: allowedActivityEntityTypes },
      },
      select: {
        id: true, entityType: true, entityId: true, action: true, title: true, description: true, createdAt: true,
        actorMember: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : [],
  ]);

  const stats = [];
  if (canPartners) stats.push({ key: "partners", label: "Partnerek", value: partnerCount, route: "/partner" });
  if (canProjects) stats.push({ key: "activeProjects", label: "Aktív projektek", value: activeProjectCount, route: "/project" });
  if (canTasks) {
    stats.push({ key: "openTasks", label: "Nyitott feladatok", value: openTaskCount, route: "/task" });
    stats.push({ key: "overdueTasks", label: "Lejárt feladatok", value: overdueTaskCount, route: "/task" });
  }

  const upcomingDeadlines = [
    ...projectDeadlines.map((project) => ({ type: "PROJECT", id: project.id, title: project.name, date: project.deadline, status: project.status, route: `/project/${project.id}` })),
    ...taskDeadlines.map((task) => ({ type: "TASK", id: task.id, title: task.title, date: task.dueDate, status: task.status, route: "/task" })),
  ].sort((left, right) => new Date(left.date) - new Date(right.date)).slice(0, 8);

  return {
    stats,
    ...(canTasks && { myTasks: myTasks.map((task) => ({ ...task, project: canProjects ? task.project : null })) }),
    ...((canProjects || canTasks) && { upcomingDeadlines }),
    ...(canActivity && { recentActivities }),
  };
}

export default { getDashboard };
