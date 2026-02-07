import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import {
  createPost,
  feed,
  likePost,
  unlikePost,
  comment,
  listComments,
  updateComment,
  deleteComment,
  archivePost,
  restorePost,
  deletePost,
  savePost,
  unsavePost,
  savedPosts,
  pinPost,
  unpinPost,
} from '../controllers/postController.js';

const router = Router();
router.post('/', authRequired, createPost);
router.get('/feed', authRequired, feed);
router.get('/saved', authRequired, savedPosts);
router.post('/:id/archive', authRequired, archivePost);
router.post('/:id/restore', authRequired, restorePost);
router.delete('/:id', authRequired, deletePost);
router.post('/:id/like', authRequired, likePost);
router.delete('/:id/like', authRequired, unlikePost);
router.post('/:id/save', authRequired, savePost);
router.delete('/:id/save', authRequired, unsavePost);
router.post('/:id/pin', authRequired, pinPost);
router.delete('/:id/pin', authRequired, unpinPost);
router.post('/:id/comments', authRequired, comment);
router.get('/:id/comments', authRequired, listComments);
router.patch('/:postId/comments/:commentId', authRequired, updateComment);
router.delete('/:postId/comments/:commentId', authRequired, deleteComment);

export default router;
