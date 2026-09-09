import express from 'express';
import partnerController from '../controllers/partnerController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import requireOrganization from '../middleware/requireOrganization.js';
import requireModule from '../middleware/requireModule.js';

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PARTNERS"));

router.get('/', partnerController.getPartners);
router.get('/export', partnerController.exportPartners);
router.get('/:id', partnerController.getPartnerById);
router.post('/', partnerController.createPartner);
router.patch('/:id', partnerController.updatePartner);
router.delete('/:id', partnerController.deletePartner);

export default router;
