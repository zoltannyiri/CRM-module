import express from 'express';
import customFieldController from '../controllers/customFieldController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import requireOrganization from '../middleware/requireOrganization.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

router.use(authMiddleware, requireOrganization);

// Value routes (no specific permission - access gated by entity permissions at page level)
router.get('/values', customFieldController.getEntityValues);
router.put('/values', customFieldController.setEntityValues);

// Admin routes (require CUSTOM_FIELDS permissions)
router.get('/', requirePermission('CUSTOM_FIELDS_VIEW'), customFieldController.listFields);
router.post('/', requirePermission('CUSTOM_FIELDS_CREATE'), customFieldController.createField);
router.patch('/:id', requirePermission('CUSTOM_FIELDS_EDIT'), customFieldController.updateField);
router.delete('/:id', requirePermission('CUSTOM_FIELDS_DELETE'), customFieldController.deleteField);

export default router;
