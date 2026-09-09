import express from 'express';
import partnerController from '../controllers/partnerController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import requireOrganization from '../middleware/requireOrganization.js';
import requireModule from '../middleware/requireModule.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PARTNERS"));

router.get('/', requirePermission("PARTNERS_VIEW"), partnerController.getPartners);
router.get('/export', requirePermission("PARTNERS_VIEW"), partnerController.exportPartners);
router.get('/:id', requirePermission("PARTNERS_VIEW"), partnerController.getPartnerById);
router.post('/', requirePermission("PARTNERS_CREATE"), partnerController.createPartner);
router.patch('/:id', requirePermission("PARTNERS_EDIT"), partnerController.updatePartner);
router.delete('/:id', requirePermission("PARTNERS_DELETE"), partnerController.deletePartner);

export default router;
