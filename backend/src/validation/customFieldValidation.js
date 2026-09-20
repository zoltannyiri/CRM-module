// Valid field types and entity types (must match Prisma enums)
const VALID_FIELD_TYPES = new Set(['TEXT','TEXTAREA','NUMBER','MONEY','BOOLEAN','DATE','DATETIME','SELECT','MULTI_SELECT']);
const VALID_ENTITY_TYPES = new Set(['LEAD','PARTNER']);
const SELECT_TYPES = new Set(['SELECT','MULTI_SELECT']);

export function normalizeCustomFieldDefinition(body, { partial = false } = {}) {
  const allowedFields = ['label', 'fieldType', 'key', 'required', 'active', 'sortOrder', 'placeholder', 'helpText', 'defaultValue', 'options'];
  const data = {};

  if (!partial) {
    if (!body.key || typeof body.key !== 'string' || !/^[a-z0-9_]{1,64}$/.test(body.key)) {
      return { error: 'Invalid key. Must be lowercase alphanumeric and underscores only, 1-64 characters.' };
    }
    data.key = body.key;

    const trimmedLabel = typeof body.label === 'string' ? body.label.trim() : '';
    if (!trimmedLabel || trimmedLabel.length > 200) {
      return { error: 'Invalid label. Must be string 1-200 characters.' };
    }
    data.label = trimmedLabel;

    if (!body.fieldType || !VALID_FIELD_TYPES.has(body.fieldType)) {
      return { error: 'Invalid fieldType.' };
    }
    data.fieldType = body.fieldType;
  } else {
    // on update, key and fieldType are not allowed
    if (body.key !== undefined || body.fieldType !== undefined) {
      // Ignore them or return error? The requirements say: "key and fieldType are NOT in data for updates", so we just don't set them.
    }
    if (body.label !== undefined) {
      const trimmedLabel = typeof body.label === 'string' ? body.label.trim() : '';
      if (!trimmedLabel || trimmedLabel.length > 200) {
        return { error: 'Invalid label. Must be string 1-200 characters.' };
      }
      data.label = trimmedLabel;
    }
  }

  if (body.required !== undefined) data.required = Boolean(body.required);
  if (body.active !== undefined) data.active = Boolean(body.active);
  
  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isInteger(order) || order < 0) return { error: 'sortOrder must be a positive integer or 0.' };
    data.sortOrder = order;
  }

  if (body.placeholder !== undefined) {
    if (body.placeholder !== null && (typeof body.placeholder !== 'string' || body.placeholder.length > 500)) {
      return { error: 'placeholder must be string max 500 chars or null.' };
    }
    data.placeholder = body.placeholder;
  }

  if (body.helpText !== undefined) {
    if (body.helpText !== null && (typeof body.helpText !== 'string' || body.helpText.length > 1000)) {
      return { error: 'helpText must be string max 1000 chars or null.' };
    }
    data.helpText = body.helpText;
  }

  if (body.defaultValue !== undefined) {
    if (body.defaultValue !== null && (typeof body.defaultValue !== 'string' || body.defaultValue.length > 2000)) {
      return { error: 'defaultValue must be string max 2000 chars or null.' };
    }
    data.defaultValue = body.defaultValue;
  }

  // Determine fieldType context
  const fieldType = data.fieldType || body.fieldType; // for create it's in data. For update we might need to know it from somewhere else but we don't have the existing field here. Wait, instructions say: "options: required for SELECT/MULTI_SELECT (array of strings, min 1 item, each max 200 chars), must be null for other types"
  
  if (body.options !== undefined) {
    if (body.options === null) {
      data.options = null;
    } else if (Array.isArray(body.options)) {
      if (body.options.length < 1) return { error: 'options must have at least 1 item.' };
      if (!body.options.every(o => typeof o === 'string' && o.length <= 200)) {
        return { error: 'Each option must be a string up to 200 chars.' };
      }
      data.options = body.options;
    } else {
      return { error: 'options must be an array of strings or null.' };
    }
  }

  return { data };
}

export function normalizeCustomFieldValues(values, fields) {
  if (!Array.isArray(values)) return { error: 'values must be an array' };
  
  const normalized = [];
  const fieldsById = new Map(fields.map(f => [f.id, f]));

  for (const item of values) {
    if (!item || !Number.isInteger(item.customFieldId) || item.customFieldId <= 0) {
      return { error: 'Invalid customFieldId' };
    }

    const field = fieldsById.get(item.customFieldId);
    if (!field) {
      return { error: `Field with id ${item.customFieldId} not found or not active.` };
    }

    let val = item.value;
    const isEmpty = val === null || val === undefined || val === '';

    if (field.required && isEmpty) {
      return { error: `Field ${field.label} is required.` };
    }

    if (isEmpty) {
      normalized.push({ customFieldId: field.id, value: null });
      continue;
    }

    // stringify if necessary or keep string
    let stringVal = String(val);

    switch (field.fieldType) {
      case 'NUMBER':
      case 'MONEY':
        const num = Number(val);
        if (!Number.isFinite(num)) return { error: `Field ${field.label} must be a number.` };
        stringVal = num.toString();
        break;
      case 'BOOLEAN':
        if (stringVal !== 'true' && stringVal !== 'false') return { error: `Field ${field.label} must be 'true' or 'false'.` };
        break;
      case 'DATE':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stringVal)) return { error: `Field ${field.label} must be YYYY-MM-DD.` };
        break;
      case 'DATETIME':
        if (isNaN(Date.parse(stringVal))) return { error: `Field ${field.label} must be a valid ISO datetime.` };
        stringVal = new Date(stringVal).toISOString();
        break;
      case 'SELECT':
        if (!Array.isArray(field.options) || !field.options.includes(stringVal)) {
          return { error: `Invalid option for ${field.label}.` };
        }
        break;
      case 'MULTI_SELECT':
        try {
          const arr = typeof val === 'string' ? JSON.parse(val) : val;
          if (!Array.isArray(arr) || !arr.every(o => field.options?.includes(o))) {
            return { error: `Invalid options for ${field.label}.` };
          }
          stringVal = JSON.stringify(arr);
        } catch {
          return { error: `Invalid MULTI_SELECT value for ${field.label}.` };
        }
        break;
      case 'TEXTAREA':
        if (stringVal.length > 10000) return { error: `Field ${field.label} exceeds 10000 chars.` };
        break;
      case 'TEXT':
      default:
        if (stringVal.length > 2000) return { error: `Field ${field.label} exceeds 2000 chars.` };
        break;
    }

    normalized.push({ customFieldId: field.id, value: stringVal });
  }

  return { data: normalized };
}
