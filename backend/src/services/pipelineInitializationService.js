import prisma from "../lib/prisma.js";

export const DEFAULT_PIPELINE_STAGES = Object.freeze([
  "Új érdeklődő", "Kapcsolatfelvétel", "Igényfelmérés", "Ajánlat", "Tárgyalás", "Megnyert", "Elveszett",
]);

export async function lockPipelineOrganization(organizationId, tx) {
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${organizationId}::integer, -1::integer)`;
}

export async function initializeDefaultPipeline(organizationId, client = prisma) {
  const initialize = async (tx) => {
    await lockPipelineOrganization(organizationId, tx);
    const existing = await tx.pipeline.findFirst({ where: { organizationId }, select: { id: true } });
    if (existing) return;
    await tx.pipeline.create({ data: {
      organizationId, name: "Értékesítés", isDefault: true,
      stages: { create: DEFAULT_PIPELINE_STAGES.map((name, index) => ({ name, position: index + 1 })) },
    } });
  };
  return client.$transaction ? client.$transaction(initialize) : initialize(client);
}
