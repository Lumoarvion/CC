import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { me, getProfile, follow, unfollow, updateAvatar, deleteAvatar, listFollowers, listFollowing, updateProfile } from '../controllers/userController.js';
import { userPosts, userReplies, userMedia, userLikes } from '../controllers/postController.js';
import { requestAccountDelete, confirmAccountDelete } from '../controllers/userDeleteController.js';
import upload from '../utils/upload.js';

const router = Router();

router.get('/me', authRequired, me);
router.patch('/me', authRequired, updateProfile);
router.post('/me/avatar', authRequired, upload.single('avatar'), updateAvatar);
router.delete('/me/avatar', authRequired, deleteAvatar);
router.post('/me/delete-request', authRequired, requestAccountDelete);
router.post('/me/delete-confirm', authRequired, confirmAccountDelete);

router.get('/:id/followers', authRequired, listFollowers);
router.get('/:id/following', authRequired, listFollowing);
router.get('/:id/posts', authRequired, userPosts);
router.get('/:id/replies', authRequired, userReplies);
router.get('/:id/media', authRequired, userMedia);
router.get('/:id/likes', authRequired, userLikes);
router.get('/:id', authRequired, getProfile);
router.post('/:id/follow', authRequired, follow);
router.delete('/:id/follow', authRequired, unfollow);

export default router;
