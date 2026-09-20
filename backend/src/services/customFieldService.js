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
  const existing = await prisma.customField.findFirst({
    where: { id, organizationId }
  });

  if (!existing) return null;

  return prisma.customField.update({
    where: { id },
    data
  });
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

async function setCustomFieldValues({ organizationId, entityType, entityId, values }, client = prisma) {
  return client.$transaction(async (tx) => {
    const customFieldIds = values.map(v => v.customFieldId);

    for (const item of values) {
      await tx.customFieldValue.upsert({
        where: { customFieldId_entityId: { customFieldId: item.customFieldId, entityId } },
        update: { value: item.value },
        create: { organizationId, customFieldId: item.customFieldId, entityType, entityId, value: item.value }
      });
    }

    await tx.customFieldValue.deleteMany({
      where: {
        organizationId,
        entityType,
        entityId,
        customFieldId: { notIn: customFieldIds }
      }
    });
    
    return true;
  });
}

export {
  getCustomFields,
  getActiveCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deactivateCustomField,
  getCustomFieldValues,
  setCustomFieldValues
};

export default {
  getCustomFields,
  getActiveCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deactivateCustomField,
  getCustomFieldValues,
  setCustomFieldValues
};
