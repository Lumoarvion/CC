import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { listPublicAnnouncements } from '../controllers/announcementController.js';

const router = Router();

router.get('/', authRequired, listPublicAnnouncements);

export default router;
