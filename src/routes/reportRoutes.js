import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createReport, listMyReports } from '../controllers/reportController.js';

const router = Router();

router.post('/', authRequired, createReport);
router.get('/me', authRequired, listMyReports);

export default router;
