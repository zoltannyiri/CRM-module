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

  // Options validation
  if (body.options !== undefined) {
    if (body.options === null) {
      data.options = null;
    } else if (Array.isArray(body.options)) {
      if (body.options.length < 1) return { error: 'A választási lehetőségek listája nem lehet üres.' };
      if (!body.options.every(o => typeof o === 'string' && o.length <= 200)) {
        return { error: 'Minden opciónak szövegesnek kell lennie (max 200 karakter).' };
      }
      data.options = body.options;
    } else {
      return { error: 'Az opcióknak tömb formátumúnak kell lenniük.' };
    }
  }

  if (!partial && (data.fieldType === 'SELECT' || data.fieldType === 'MULTI_SELECT')) {
    if (!Array.isArray(data.options) || data.options.length < 1) {
      return { error: 'A legördülő és többválasztós mezőkhöz legalább egy opció megadása kötelező.' };
    }
  }

  return { data };
}

export function normalizeCustomFieldValues(values, fields, { isCreate = false } = {}) {
  const inputList = values === undefined || values === null ? [] : values;
  if (!Array.isArray(inputList)) return { error: 'A customFieldValues mezőnek tömbnek kell lennie.' };

  const normalized = [];
  const fieldsById = new Map(fields.map(f => [f.id, f]));
  const seenFieldIds = new Set();

  for (const item of inputList) {
    if (!item || typeof item !== 'object' || !Number.isInteger(item.customFieldId) || item.customFieldId <= 0) {
      return { error: 'Érvénytelen customFieldId.' };
    }

    if (seenFieldIds.has(item.customFieldId)) {
      return { error: `Ismétlődő customFieldId a kérésben: ${item.customFieldId}.` };
    }
    seenFieldIds.add(item.customFieldId);

    const field = fieldsById.get(item.customFieldId);
    if (!field) {
      return { error: `A(z) ${item.customFieldId} azonosítójú mező nem létezik vagy inaktív.` };
    }

    let val = item.value;
    const isEmpty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '');

    if (field.required && isEmpty) {
      return { error: `A(z) ${field.label} mező kitöltése kötelező.` };
    }

    if (isEmpty) {
      normalized.push({ customFieldId: field.id, value: null });
      continue;
    }

    let stringVal = typeof val === 'string' ? val.trim() : String(val);

    switch (field.fieldType) {
      case 'NUMBER':
      case 'MONEY': {
        const num = Number(stringVal);
        if (!Number.isFinite(num)) return { error: `A(z) ${field.label} mező csak szám lehet.` };
        stringVal = num.toString();
        break;
      }
      case 'BOOLEAN': {
        if (stringVal !== 'true' && stringVal !== 'false') {
          return { error: `A(z) ${field.label} mező értéke csak 'true' vagy 'false' lehet.` };
        }
        break;
      }
      case 'DATE': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stringVal)) {
          return { error: `A(z) ${field.label} mező dátum formátuma ÉÉÉÉ-HH-NN kell legyen.` };
        }
        break;
      }
      case 'DATETIME': {
        if (isNaN(Date.parse(stringVal))) {
          return { error: `A(z) ${field.label} mező érvényes ISO dátum és idő formátumú kell legyen.` };
        }
        stringVal = new Date(stringVal).toISOString();
        break;
      }
      case 'SELECT': {
        const opts = Array.isArray(field.options) ? field.options : [];
        if (!opts.includes(stringVal)) {
          return { error: `Érvénytelen választás a(z) ${field.label} mezőnél.` };
        }
        break;
      }
      case 'MULTI_SELECT': {
        try {
          const arr = typeof val === 'string' ? JSON.parse(val) : val;
          const opts = Array.isArray(field.options) ? field.options : [];
          if (!Array.isArray(arr) || !arr.every(o => opts.includes(o))) {
            return { error: `Érvénytelen választás a(z) ${field.label} mezőnél.` };
          }
          stringVal = JSON.stringify(arr);
        } catch {
          return { error: `A(z) ${field.label} többválasztós mező érvénytelen.` };
        }
        break;
      }
      case 'TEXTAREA': {
        if (stringVal.length > 10000) return { error: `A(z) ${field.label} mező legfeljebb 10000 karakter lehet.` };
        break;
      }
      case 'TEXT':
      default: {
        if (stringVal.length > 2000) return { error: `A(z) ${field.label} mező legfeljebb 2000 karakter lehet.` };
        break;
      }
    }

    normalized.push({ customFieldId: field.id, value: stringVal });
  }

  // Create ellenőrzés: minden aktív kötelező mezőnek rendelkeznie kell nem-üres értékkel!
  if (isCreate) {
    for (const field of fields) {
      if (field.required) {
        const found = normalized.find(n => n.customFieldId === field.id);
        if (!found || found.value === null) {
          return { error: `A(z) ${field.label} mező kitöltése kötelező.` };
        }
      }
    }
  }

  return { data: normalized };
}
