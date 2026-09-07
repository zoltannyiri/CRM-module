import partnerService from '../services/partnerService.js';
import { buildPartnerExport, exportContentTypes } from '../services/partnerExportService.js';

async function getPartners(req, res, next) {
  try {
    const partners = await partnerService.getPartners({
      organizationId: req.organization.id,
    });

    return res.json(partners);
  } catch (error) {
    next(error);
  }
}

async function getPartnerById(req, res, next) {
  try {
    const partnerId = Number(req.params.id);
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
    const { name, email, phone, type, address, website, taxNumber, note } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const partner = await partnerService.createPartner({
      organizationId: req.organization.id,
      name: name.trim(),
      phone,
      email,
      address,
      taxNumber,
      note,
      website,
      type,
    });

    return res.status(201).json(partner);
  } catch (error) {
    next(error);
  }
}

async function updatePartner(req, res, next) {
  try {
    const partnerId = Number(req.params.id);
    const partner = await partnerService.updatePartner({
      organizationId: req.organization.id,
      partnerId,
      data: req.body,
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
    const partnerId = Number(req.params.id);
    const partner = await partnerService.deletePartner({
      organizationId: req.organization.id,
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
