import leadService from "../services/leadService.js";
import customFieldService from "../services/customFieldService.js";
import { normalizeCustomFieldValues } from "../validation/customFieldValidation.js";
import { hasPermission } from "../services/permissionService.js";
import { isModuleEnabled } from "../services/organizationModuleService.js";
import { normalizePartnerPayload } from "../validation/partnerValidation.js";
import viewPreferenceService from "../services/viewPreferenceService.js";

export const LEAD_STATUSES = new Set(["NEW", "CONTACTED", "QUALIFIED", "LOST"]);
export const LEAD_SOURCES = new Set(["WEBSITE", "REFERRAL", "PHONE", "EMAIL", "SOCIAL", "OTHER"]);
const fields = new Set(["name", "companyName", "email", "phone", "note", "status", "source", "assignedMemberId", "customFieldValues"]);

function positiveId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

async function canViewConvertedPartner(req) {
  return await isModuleEnabled(req.organization.id, "PARTNERS") && await hasPermission(req.membership, "PARTNERS_VIEW");
}

export function normalizePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Érvénytelen érdeklődő adatok." };
  if (Object.keys(body).some((key) => !fields.has(key))) return { error: "Ismeretlen vagy nem módosítható mező." };
  const data = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) return { error: "A név kötelező, legfeljebb 200 karakter." };
    data.name = body.name.trim();
  }
  for (const [field, max] of [["companyName", 200], ["email", 254], ["phone", 50], ["note", 10000]]) {
    if (!Object.hasOwn(body, field)) continue;
    if (body[field] !== null && typeof body[field] !== "string") return { error: `Érvénytelen ${field} mező.` };
    const value = body[field]?.trim() || null;
    if (value && value.length > max) return { error: `A ${field} mező legfeljebb ${max} karakter lehet.` };
    if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "Érvénytelen e-mail cím." };
    if (field === "phone" && value && (!/^\+?[\d\s().-]+$/.test(value) || value.replace(/\D/g, "").length < 6 || value.replace(/\D/g, "").length > 15)) return { error: "Érvénytelen telefonszám." };
    data[field] = value;
  }
  for (const [field, values, fallback] of [["status", LEAD_STATUSES, "NEW"], ["source", LEAD_SOURCES, "OTHER"]]) {
    if (!Object.hasOwn(body, field)) {
      if (!partial) data[field] = fallback;
      continue;
    }
    if (!values.has(body[field])) return { error: field === "status" ? "Érvénytelen érdeklődő státusz." : "Érvénytelen érdeklődő forrás." };
    data[field] = body[field];
  }
  if (Object.hasOwn(body, "assignedMemberId")) {
    const value = body.assignedMemberId;
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2147483647)) return { error: "Érvénytelen felelős azonosító." };
    data.assignedMemberId = value;
  }
  if (Object.hasOwn(body, "customFieldValues")) {
    if (body.customFieldValues !== null && !Array.isArray(body.customFieldValues)) {
      return { error: "A customFieldValues mezőnek tömbnek kell lennie." };
    }
    data.customFieldValues = body.customFieldValues;
  }
  return { data };
}

export function normalizeFilters(query) {
  const data = {};
  for (const [field, values] of [["status", LEAD_STATUSES], ["source", LEAD_SOURCES]]) {
    if (query[field] !== undefined) {
      if (!values.has(query[field])) return { error: `Érvénytelen ${field} szűrő.` };
      data[field] = query[field];
    }
  }
  if (query.assignedMemberId !== undefined) {
    const id = positiveId(query.assignedMemberId);
    if (!id) return { error: "Érvénytelen felelős szűrő." };
    data.assignedMemberId = id;
  }
  if (query.search !== undefined) {
    if (typeof query.search !== "string" || query.search.length > 200) return { error: "Érvénytelen keresés." };
    data.search = query.search.trim();
  }
  if (query.sortDirection !== undefined) {
    if (!["asc", "desc"].includes(query.sortDirection)) return { error: "Érvénytelen rendezés." };
    data.sortDirection = query.sortDirection;
  }
  return { data };
}

async function getLeads(req, res, next) {
  try {
    const normalized = normalizeFilters(req.query);
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const preference = await viewPreferenceService.getResolvedPreference({ organizationId: req.organization.id, organizationMemberId: req.membership.id, entityType: "LEAD" });
    const customFieldIds = preference.columns.filter(({ type }) => type === "CUSTOM_FIELD").map(({ customFieldId }) => customFieldId);
    return res.json(await leadService.getLeads({ organizationId: req.organization.id, includeConvertedPartner: await canViewConvertedPartner(req), customFieldIds, ...normalized.data }));
  } catch (error) { return next(error); }
}

async function getLeadById(req, res, next) {
  try {
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({ message: "Érvénytelen érdeklődő azonosító." });
    const lead = await leadService.getLeadById({ organizationId: req.organization.id, leadId, includeConvertedPartner: await canViewConvertedPartner(req) });
    if (!lead) return res.status(404).json({ message: "Érdeklődő nem található." });
    return res.json(lead);
  } catch (error) { return next(error); }
}

async function save(req, res, next, partial) {
  try {
    const leadId = partial ? positiveId(req.params.id) : undefined;
    if (partial && !leadId) return res.status(400).json({ message: "Érvénytelen érdeklődő azonosító." });
    const normalized = normalizePayload(req.body, { partial });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    const activeFields = await customFieldService.getActiveCustomFields({
      organizationId: req.organization.id,
      entityType: "LEAD"
    });

    let customFieldValues = undefined;
    if (!partial || normalized.data.customFieldValues !== undefined) {
      const customValidation = normalizeCustomFieldValues(
        normalized.data.customFieldValues,
        activeFields,
        { isCreate: !partial }
      );
      if (customValidation.error) {
        return res.status(400).json({ message: customValidation.error });
      }
      customFieldValues = customValidation.data;
    }

    const { customFieldValues: _discard, ...leadData } = normalized.data;
    const args = {
      organizationId: req.organization.id,
      actorMemberId: req.membership.id,
      leadId,
      data: leadData,
      customFieldValues
    };
    const lead = await (partial ? leadService.updateLead(args) : leadService.createLead(args));
    if (!lead) return res.status(404).json({ message: "Érdeklődő vagy szervezeti tag nem található." });
    return res.status(partial ? 200 : 201).json(lead);
  } catch (error) { return next(error); }
}
const createLead = (req, res, next) => save(req, res, next, false);
const updateLead = (req, res, next) => save(req, res, next, true);

async function deleteLead(req, res, next) {
  try {
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({ message: "Érvénytelen érdeklődő azonosító." });
    const deleted = await leadService.deleteLead({ organizationId: req.organization.id, actorMemberId: req.membership.id, leadId });
    if (!deleted) return res.status(404).json({ message: "Érdeklődő nem található." });
    return res.json({ message: "Érdeklődő törölve." });
  } catch (error) { return next(error); }
}

async function convertLead(req, res, next) {
  try {
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({ message: "Érvénytelen érdeklődő azonosító." });
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, "partner")) {
      return res.status(400).json({ message: "Érvénytelen konverziós adatok." });
    }
    const normalized = normalizePartnerPayload(req.body.partner);
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const includeConvertedPartner = await hasPermission(req.membership, "PARTNERS_VIEW");
    const result = await leadService.convertLead({
      organizationId: req.organization.id,
      actorMemberId: req.membership.id,
      leadId,
      partner: normalized.data,
      includeConvertedPartner,
    });
    return res.status(201).json(result);
  } catch (error) { return next(error); }
}
export default { getLeads, getLeadById, createLead, updateLead, deleteLead, convertLead };
