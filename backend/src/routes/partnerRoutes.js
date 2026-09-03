import express from 'express';
import partnerController from '../controllers/partnerController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import requireOrganization from '../middleware/requireOrganization.js';

const router = express.Router();

router.get('/', authMiddleware, requireOrganization, partnerController.getPartners);
router.get('/:id', authMiddleware, requireOrganization, partnerController.getPartnerById);
router.post('/', authMiddleware, requireOrganization, partnerController.createPartner);
router.patch('/:id', authMiddleware, requireOrganization, partnerController.updatePartner);
router.delete('/:id', authMiddleware, requireOrganization, partnerController.deletePartner);

export default router;