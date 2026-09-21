import prisma from '../lib/prisma.js';

async function getCustomFields({ organizationId, entityType }) {
  const where = { organizationId };
  if (entityType) {
    where.entityType = entityType;
  }
  
  return prisma.customField.findMany({
    where,
    include: { _count: { select: { values: true } } },
    orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }]
  });
}

async function getActiveCustomFields({ organizationId, entityType }) {
  return prisma.customField.findMany({
    where: { organizationId, entityType, active: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
  });
}

async function getCustomFieldById({ organizationId, id }) {
  return prisma.customField.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { values: true } } }
  });
}

async function createCustomField({ organizationId, data }) {
  const existing = await prisma.customField.findFirst({
    where: { organizationId, entityType: data.entityType, key: data.key }
  });

  if (existing) {
    const error = new Error('Ez a mezőkulcs már létezik ennél az entitás típusnál.');
    error.statusCode = 409;
    throw error;
  }

  return prisma.customField.create({
    data: {
      organizationId,
      ...data
    }
  });
}

async function updateCustomField({ organizationId, id, data }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customField.findFirst({ where: { id, organizationId } });
    if (!existing) return null;

    if (Array.isArray(data.options) && Array.isArray(existing.options)) {
      const removed = existing.options.filter((option) => !data.options.includes(option));
      if (removed.length) {
        const storedValues = await tx.customFieldValue.findMany({
          where: { organizationId, customFieldId: id, value: { not: null } },
          select: { value: true },
        });
        const used = existing.fieldType === 'MULTI_SELECT'
          ? storedValues.some(({ value }) => {
              try { return JSON.parse(value).some((item) => removed.includes(item)); } catch { return false; }
            })
          : storedValues.some(({ value }) => removed.includes(value));
        if (used) {
          const error = new Error('Használatban lévő választási lehetőség nem távolítható el.');
          error.statusCode = 409;
          error.code = 'CUSTOM_FIELD_OPTION_IN_USE';
          throw error;
        }
      }
    }

    return tx.customField.update({ where: { id }, data });
  });
}

async function getBulkCustomFieldValues({ organizationId, entityType, entityIds, customFieldIds }, client = prisma) {
  if (!entityIds.length || !customFieldIds.length) return new Map();
  const values = await client.customFieldValue.findMany({
    where: {
      organizationId,
      entityType,
      entityId: { in: entityIds },
      customFieldId: { in: customFieldIds },
    },
    select: { entityId: true, customFieldId: true, value: true },
  });
  const byEntity = new Map();
  for (const item of values) {
    if (!byEntity.has(item.entityId)) byEntity.set(item.entityId, {});
    byEntity.get(item.entityId)[item.customFieldId] = item.value;
  }
  return byEntity;
}

async function deactivateCustomField({ organizationId, id }) {
  const existing = await prisma.customField.findFirst({
    where: { id, organizationId }
  });

  if (!existing) return null;

  return prisma.customField.update({
    where: { id },
    data: { active: false }
  });
}

async function getCustomFieldValues({ organizationId, entityType, entityId }) {
  const activeFields = await prisma.customField.findMany({
    where: { organizationId, entityType, active: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, key: true, label: true, fieldType: true, required: true, active: true, sortOrder: true, options: true, placeholder: true, helpText: true }
  });

  const values = await prisma.customFieldValue.findMany({
    where: { organizationId, entityType, entityId },
    include: {
      customField: {
        select: { id: true, key: true, label: true, fieldType: true, required: true, active: true, sortOrder: true, options: true, placeholder: true, helpText: true }
      }
    }
  });

  const valuesMap = {};
  for (const v of values) {
    valuesMap[v.customFieldId] = v.value;
  }

  // Ensure all active fields exist in the map (even if null)
  for (const field of activeFields) {
    if (!(field.id in valuesMap)) {
      valuesMap[field.id] = null;
    }
  }

  return { fields: activeFields, values: valuesMap };
}

async function assertEntityExists({ organizationId, entityType, entityId }, client = prisma) {
  if (entityType === 'LEAD') {
    const lead = await client.lead.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true }
    });
    return Boolean(lead);
  }
  if (entityType === 'PARTNER') {
    const partner = await client.partner.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true }
    });
    return Boolean(partner);
  }
  return false;
}

async function setCustomFieldValues({ organizationId, entityType, entityId, values }, client = prisma) {
  const execute = async (tx) => {
    for (const item of values) {
      if (item.value === null || item.value === undefined || item.value === '') {
        await tx.customFieldValue.deleteMany({
          where: {
            organizationId,
            customFieldId: item.customFieldId,
            entityId
          }
        });
      } else {
        await tx.customFieldValue.upsert({
          where: { customFieldId_entityId: { customFieldId: item.customFieldId, entityId } },
          update: { value: item.value },
          create: { organizationId, customFieldId: item.customFieldId, entityType, entityId, value: item.value }
        });
      }
    }
    return true;
  };

  if (typeof client.$transaction === 'function') {
    return client.$transaction(execute);
  }
  return execute(client);
}

export {
  getCustomFields,
  getActiveCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deactivateCustomField,
  getCustomFieldValues,
  setCustomFieldValues,
  assertEntityExists,
  getBulkCustomFieldValues,
};

export default {
  getCustomFields,
  getActiveCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deactivateCustomField,
  getCustomFieldValues,
  setCustomFieldValues,
  assertEntityExists,
  getBulkCustomFieldValues,
};
