// Valid field types and entity types (must match Prisma enums)
const VALID_FIELD_TYPES = new Set(['TEXT','TEXTAREA','NUMBER','MONEY','BOOLEAN','DATE','DATETIME','SELECT','MULTI_SELECT']);
const VALID_ENTITY_TYPES = new Set(['LEAD','PARTNER']);
const SELECT_TYPES = new Set(['SELECT','MULTI_SELECT']);

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length < 1) return { error: 'A választási lehetőségek listája nem lehet üres.' };
  const normalized = [];
  for (const option of options) {
    if (typeof option !== 'string') return { error: 'Minden opciónak szövegesnek kell lennie (max 200 karakter).' };
    const value = option.trim();
    if (!value || value.length > 200) return { error: 'Minden opciónak nem üres, legfeljebb 200 karakteres szövegnek kell lennie.' };
    if (normalized.includes(value)) return { error: 'A választási lehetőségek nem tartalmazhatnak ismétlődő értéket.' };
    normalized.push(value);
  }
  return { data: normalized };
}

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeCustomFieldValue(value, field, { allowNull = true, strictInput = false } = {}) {
  const empty = value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  if (empty) return allowNull ? { data: null } : { error: `A(z) ${field.label} mező kitöltése kötelező.` };
  if (strictInput) {
    if (['TEXT', 'TEXTAREA', 'SELECT', 'DATE', 'DATETIME'].includes(field.fieldType) && typeof value !== 'string') {
      return { error: `A(z) ${field.label} alapértelmezett értéke szöveges kell legyen.` };
    }
    if (['NUMBER', 'MONEY'].includes(field.fieldType) && !['string', 'number'].includes(typeof value)) {
      return { error: `A(z) ${field.label} alapértelmezett értéke szám kell legyen.` };
    }
    if (field.fieldType === 'BOOLEAN' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return { error: `A(z) ${field.label} alapértelmezett értéke csak true vagy false lehet.` };
    }
    if (field.fieldType === 'MULTI_SELECT' && typeof value !== 'string' && !Array.isArray(value)) {
      return { error: `A(z) ${field.label} alapértelmezett értéke lista kell legyen.` };
    }
  }
  let normalized = typeof value === 'string' ? value.trim() : String(value);
  switch (field.fieldType) {
    case 'NUMBER':
    case 'MONEY': {
      const number = Number(normalized);
      if (!Number.isFinite(number)) return { error: `A(z) ${field.label} mező csak szám lehet.` };
      normalized = number.toString();
      break;
    }
    case 'BOOLEAN':
      if (normalized !== 'true' && normalized !== 'false') return { error: `A(z) ${field.label} mező értéke csak 'true' vagy 'false' lehet.` };
      break;
    case 'DATE':
      if (!isValidDateOnly(normalized)) return { error: `A(z) ${field.label} mező dátum formátuma ÉÉÉÉ-HH-NN kell legyen.` };
      break;
    case 'DATETIME': {
      if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized) || Number.isNaN(Date.parse(normalized))) return { error: `A(z) ${field.label} mező érvényes ISO dátum és idő formátumú kell legyen.` };
      normalized = new Date(normalized).toISOString();
      break;
    }
    case 'SELECT': {
      const options = Array.isArray(field.options) ? field.options : [];
      if (!options.includes(normalized)) return { error: `Érvénytelen választás a(z) ${field.label} mezőnél.` };
      break;
    }
    case 'MULTI_SELECT': {
      try {
        const values = typeof value === 'string' ? JSON.parse(value) : value;
        const options = Array.isArray(field.options) ? field.options : [];
        if (!Array.isArray(values) || values.some((item) => typeof item !== 'string') || new Set(values).size !== values.length || !values.every((item) => options.includes(item))) {
          return { error: `Érvénytelen választás a(z) ${field.label} mezőnél.` };
        }
        normalized = JSON.stringify(values);
      } catch {
        return { error: `A(z) ${field.label} többválasztós mező érvénytelen.` };
      }
      break;
    }
    case 'TEXTAREA':
      if (normalized.length > 10000) return { error: `A(z) ${field.label} mező legfeljebb 10000 karakter lehet.` };
      break;
    case 'TEXT':
    default:
      if (normalized.length > 2000) return { error: `A(z) ${field.label} mező legfeljebb 2000 karakter lehet.` };
  }
  return { data: normalized };
}

export function normalizeCustomFieldDefinition(body, { partial = false, existingField = null } = {}) {
  const allowedFields = ['label', 'fieldType', 'key', 'required', 'active', 'sortOrder', 'placeholder', 'helpText', 'defaultValue', 'options'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Érvénytelen egyéni mező adatok.' };
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) return { error: 'Ismeretlen vagy nem módosítható egyéni mező adat.' };
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
    if (body.key !== undefined || body.fieldType !== undefined) {
      return { error: 'A mező kulcsa és típusa nem módosítható.' };
    }
    if (body.label !== undefined) {
      const trimmedLabel = typeof body.label === 'string' ? body.label.trim() : '';
      if (!trimmedLabel || trimmedLabel.length > 200) {
        return { error: 'Invalid label. Must be string 1-200 characters.' };
      }
      data.label = trimmedLabel;
    }
  }

  if (body.required !== undefined) {
    if (typeof body.required !== 'boolean') return { error: 'A required mező csak logikai érték lehet.' };
    data.required = body.required;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { error: 'Az active mező csak logikai érték lehet.' };
    data.active = body.active;
  }
  
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

  const effectiveFieldType = partial ? existingField?.fieldType : data.fieldType;
  if (!effectiveFieldType || !VALID_FIELD_TYPES.has(effectiveFieldType)) return { error: 'A meglévő mezőtípus nem határozható meg.' };

  if (body.options !== undefined) {
    if (!SELECT_TYPES.has(effectiveFieldType)) {
      if (body.options !== null) return { error: 'Ehhez a mezőtípushoz nem adható options lista.' };
      data.options = null;
    } else {
      const normalizedOptions = normalizeOptions(body.options);
      if (normalizedOptions.error) return normalizedOptions;
      data.options = normalizedOptions.data;
    }
  }

  const effectiveOptions = Object.hasOwn(data, 'options') ? data.options : existingField?.options;
  if (SELECT_TYPES.has(effectiveFieldType) && (!Array.isArray(effectiveOptions) || effectiveOptions.length < 1)) {
    return { error: 'A legördülő és többválasztós mezőkhöz legalább egy opció megadása kötelező.' };
  }

  const effectiveDefault = body.defaultValue !== undefined ? body.defaultValue : existingField?.defaultValue;
  if (body.defaultValue !== undefined || (body.options !== undefined && effectiveDefault != null)) {
    const normalizedDefault = normalizeCustomFieldValue(effectiveDefault, {
      fieldType: effectiveFieldType,
      label: data.label || existingField?.label || 'Alapértelmezett érték',
      options: effectiveOptions,
    }, { strictInput: true });
    if (normalizedDefault.error) return normalizedDefault;
    if (body.defaultValue !== undefined) data.defaultValue = normalizedDefault.data;
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

    const result = normalizeCustomFieldValue(val, field, { allowNull: !field.required });
    if (result.error) return result;
    normalized.push({ customFieldId: field.id, value: result.data });
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
