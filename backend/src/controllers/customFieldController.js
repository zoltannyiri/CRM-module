import customFieldService from '../services/customFieldService.js';
import { normalizeCustomFieldDefinition, normalizeCustomFieldValues } from '../validation/customFieldValidation.js';
import { hasPermission } from '../services/permissionService.js';
import { isModuleEnabled } from '../services/organizationModuleService.js';

function positiveId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

const listFields = async (req, res, next) => {
  try {
    const { entityType } = req.query;
    if (entityType && entityType !== 'LEAD' && entityType !== 'PARTNER') {
      return res.status(400).json({ message: 'Érvénytelen entitás típus.' });
    }
    
    const fields = await customFieldService.getCustomFields({
      organizationId: req.organization.id,
      entityType
    });
    
    res.json(fields);
  } catch (error) {
    next(error);
  }
};

const createField = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: 'Érvénytelen egyéni mező adatok.' });
    const { entityType, ...rest } = req.body;
    if (entityType !== 'LEAD' && entityType !== 'PARTNER') {
      return res.status(400).json({ message: 'Érvénytelen entitás típus.' });
    }

    const { data, error } = normalizeCustomFieldDefinition(rest);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const field = await customFieldService.createCustomField({
      organizationId: req.organization.id,
      data: { entityType, ...data }
    });

    res.status(201).json(field);
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

const updateField = async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Érvénytelen azonosító.' });

    const existingField = await customFieldService.getCustomFieldById({ organizationId: req.organization.id, id });
    if (!existingField) return res.status(404).json({ message: 'Mező nem található.' });

    const { data, error } = normalizeCustomFieldDefinition(req.body, { partial: true, existingField });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const updated = await customFieldService.updateCustomField({
      organizationId: req.organization.id,
      id,
      data
    });

    if (!updated) {
      return res.status(404).json({ message: 'Mező nem található.' });
    }

    res.json(updated);
  } catch (error) {
    if (error.statusCode === 409) return res.status(409).json({ message: error.message, ...(error.code && { code: error.code }) });
    next(error);
  }
};

const deleteField = async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Érvénytelen azonosító.' });

    const updated = await customFieldService.deactivateCustomField({
      organizationId: req.organization.id,
      id
    });

    if (!updated) {
      return res.status(404).json({ message: 'Mező nem található.' });
    }

    res.json({ message: 'Mező deaktiválva.' });
  } catch (error) {
    next(error);
  }
};

const getEntityValues = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    if (entityType !== 'LEAD' && entityType !== 'PARTNER') {
      return res.status(400).json({ message: 'Érvénytelen entitás típus.' });
    }
    const parsedEntityId = positiveId(entityId);
    if (!parsedEntityId) {
      return res.status(400).json({ message: 'Érvénytelen entitás azonosító.' });
    }

    if (entityType === 'LEAD') {
      const moduleOk = await isModuleEnabled(req.organization.id, 'LEADS');
      const permOk = await hasPermission(req.membership, 'LEADS_VIEW');
      if (!moduleOk || !permOk) return res.status(403).json({ message: 'Nincs jogosultságod a művelethez.', code: 'PERMISSION_DENIED' });
    } else {
      const moduleOk = await isModuleEnabled(req.organization.id, 'PARTNERS');
      const permOk = await hasPermission(req.membership, 'PARTNERS_VIEW');
      if (!moduleOk || !permOk) return res.status(403).json({ message: 'Nincs jogosultságod a művelethez.', code: 'PERMISSION_DENIED' });
    }

    const exists = await customFieldService.assertEntityExists({
      organizationId: req.organization.id,
      entityType,
      entityId: parsedEntityId
    });
    if (!exists) {
      return res.status(404).json({ message: entityType === 'LEAD' ? 'Érdeklődő nem található.' : 'Partner nem található.' });
    }

    const data = await customFieldService.getCustomFieldValues({
      organizationId: req.organization.id,
      entityType,
      entityId: parsedEntityId
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

const setEntityValues = async (req, res, next) => {
  try {
    const { entityType, entityId, values } = req.body;
    
    if (entityType !== 'LEAD' && entityType !== 'PARTNER') {
      return res.status(400).json({ message: 'Érvénytelen entitás típus.' });
    }
    const parsedEntityId = positiveId(String(entityId));
    if (!parsedEntityId) {
      return res.status(400).json({ message: 'Érvénytelen entitás azonosító.' });
    }
    if (!Array.isArray(values)) {
      return res.status(400).json({ message: 'A values tömb formátumú kell legyen.' });
    }

    if (entityType === 'LEAD') {
      const moduleOk = await isModuleEnabled(req.organization.id, 'LEADS');
      const permOk = await hasPermission(req.membership, 'LEADS_EDIT');
      if (!moduleOk || !permOk) return res.status(403).json({ message: 'Nincs jogosultságod a művelethez.', code: 'PERMISSION_DENIED' });
    } else {
      const moduleOk = await isModuleEnabled(req.organization.id, 'PARTNERS');
      const permOk = await hasPermission(req.membership, 'PARTNERS_EDIT');
      if (!moduleOk || !permOk) return res.status(403).json({ message: 'Nincs jogosultságod a művelethez.', code: 'PERMISSION_DENIED' });
    }

    const exists = await customFieldService.assertEntityExists({
      organizationId: req.organization.id,
      entityType,
      entityId: parsedEntityId
    });
    if (!exists) {
      return res.status(404).json({ message: entityType === 'LEAD' ? 'Érdeklődő nem található.' : 'Partner nem található.' });
    }

    const activeFields = await customFieldService.getActiveCustomFields({
      organizationId: req.organization.id,
      entityType
    });

    const { data: normalizedValues, error } = normalizeCustomFieldValues(values, activeFields);
    if (error) {
      return res.status(400).json({ message: error });
    }

    await customFieldService.setCustomFieldValues({
      organizationId: req.organization.id,
      entityType,
      entityId: parsedEntityId,
      values: normalizedValues
    });

    res.json({ message: 'Értékek mentve.' });
  } catch (error) {
    next(error);
  }
};

export default {
  listFields,
  createField,
  updateField,
  deleteField,
  getEntityValues,
  setEntityValues
};
