import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createPresignedUpload } from '../controllers/mediaController.js';

const router = Router();

router.post('/presign', authRequired, createPresignedUpload);

export default router;
