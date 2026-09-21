import partnerService from '../services/partnerService.js';
import customFieldService from '../services/customFieldService.js';
import { normalizeCustomFieldValues } from '../validation/customFieldValidation.js';
import viewPreferenceService from '../services/viewPreferenceService.js';
import { buildPartnerExport, exportContentTypes } from '../services/partnerExportService.js';
import { normalizePartnerPayload } from '../validation/partnerValidation.js';
import { normalizeFilters as normalizeAdvancedFilters } from '../validation/filterValidation.js';

function positiveId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

async function getPartners(req, res, next) {
  try {
    let advancedFilters = [];
    if (req.query.filters !== undefined) {
      const normAdv = await normalizeAdvancedFilters(req.query.filters, {
        organizationId: req.organization.id,
        entityType: 'PARTNER',
      });
      if (normAdv.error) return res.status(400).json({ message: normAdv.error });
      advancedFilters = normAdv.data;
    }

    const preference = await viewPreferenceService.getResolvedPreference({ organizationId: req.organization.id, organizationMemberId: req.membership.id, entityType: 'PARTNER' });
    const customFieldIds = preference.columns.filter(({ type }) => type === 'CUSTOM_FIELD').map(({ customFieldId }) => customFieldId);
    const partners = await partnerService.getPartners({
      organizationId: req.organization.id,
      customFieldIds,
      filters: advancedFilters,
    });

    return res.json(partners);
  } catch (error) {
    next(error);
  }
}

async function getPartnerById(req, res, next) {
  try {
    const partnerId = positiveId(req.params.id);
    if (!partnerId) return res.status(400).json({ message: "Érvénytelen partner azonosító." });
    const partner = await partnerService.getPartnerById({
      organizationId: req.organization.id,
      partnerId,
    });

    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    return res.status(200).json(partner);
  } catch (error) {
    next(error);
  }
}

async function exportPartners(req, res, next) {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (!Object.hasOwn(exportContentTypes, format)) {
      return res.status(400).json({ message: 'A támogatott formátumok: xlsx, pdf, csv.' });
    }

    const partners = await partnerService.getPartnersForExport({
      organizationId: req.organization.id,
      query: String(req.query.q || ''),
      type: String(req.query.type || 'ALL'),
      sortDirection: req.query.sort === 'asc' ? 'asc' : 'desc',
    });
    const file = await buildPartnerExport({
      format,
      partners,
      organizationName: req.organization.name,
    });
    const date = new Date().toISOString().slice(0, 10);

    res.set({
      'Content-Type': exportContentTypes[format],
      'Content-Disposition': `attachment; filename="partnerek-${date}.${format}"`,
      'Cache-Control': 'private, no-store',
    });
    return res.send(file);
  } catch (error) {
    return next(error);
  }
}

async function createPartner(req, res, next) {
  try {
    const normalized = normalizePartnerPayload(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    const activeFields = await customFieldService.getActiveCustomFields({
      organizationId: req.organization.id,
      entityType: "PARTNER"
    });

    const customValidation = normalizeCustomFieldValues(
      normalized.data.customFieldValues,
      activeFields,
      { isCreate: true }
    );
    if (customValidation.error) {
      return res.status(400).json({ message: customValidation.error });
    }

    const { customFieldValues: _discard, ...partnerData } = normalized.data;
    const partner = await partnerService.createPartner({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      data: partnerData,
      customFieldValues: customValidation.data
    });

    return res.status(201).json(partner);
  } catch (error) {
    next(error);
  }
}

async function updatePartner(req, res, next) {
  try {
    const partnerId = positiveId(req.params.id);
    if (!partnerId) return res.status(400).json({ message: "Érvénytelen partner azonosító." });
    const normalized = normalizePartnerPayload(req.body, { partial: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    let customFieldValues = undefined;
    if (normalized.data.customFieldValues !== undefined) {
      const activeFields = await customFieldService.getActiveCustomFields({
        organizationId: req.organization.id,
        entityType: "PARTNER"
      });
      const customValidation = normalizeCustomFieldValues(
        normalized.data.customFieldValues,
        activeFields,
        { isCreate: false }
      );
      if (customValidation.error) {
        return res.status(400).json({ message: customValidation.error });
      }
      customFieldValues = customValidation.data;
    }

    const { customFieldValues: _discard, ...partnerData } = normalized.data;
    const partner = await partnerService.updatePartner({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      partnerId,
      data: partnerData,
      customFieldValues
    });

    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    return res.status(200).json(partner);
  } catch (error) {
    next(error);
  }
}

async function deletePartner(req, res, next) {
  try {
    const partnerId = positiveId(req.params.id);
    if (!partnerId) return res.status(400).json({ message: "Érvénytelen partner azonosító." });
    const partner = await partnerService.deletePartner({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      partnerId,
    });
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    return res.status(200).json({ message: 'Partner deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export default {
  getPartners,
  exportPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
};
