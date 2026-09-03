import partnerService from '../services/partnerService.js';

async function getPartners(req, res, next) {
  try {
    const partners = await partnerService.getPartners({
      organizationId: req.user.organizationId,
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
      organizationId: req.user.organizationId,
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

async function createPartner(req, res, next) {
  try {
    const { name, email, phone, type, address, website, taxNumber, note } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const partner = await partnerService.createPartner({
      organizationId: req.user.organizationId,
      name: name.trim(),
      phone,
      email,
      address,
      taxNumber,
      address,
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
      organizationId: req.user.organizationId,
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
      organizationId: req.user.organizationId,
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
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
};