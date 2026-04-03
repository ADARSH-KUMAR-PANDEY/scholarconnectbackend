import express from 'express';
import * as userController from '../controllers/user.controller.js';
import { verifyToken, verifyRole } from '../middleware/auth.js';

const router = express.Router();

// Admin Routes
router.get('/pending-reviewers', verifyToken, verifyRole(['admin']), userController.getPendingReviewers);
router.get('/reviewers', verifyToken, verifyRole(['admin']), userController.getAllReviewers);
router.get('/authors', verifyToken, verifyRole(['admin']), userController.getAuthors);
router.post('/reviewer-status', verifyToken, verifyRole(['admin']), userController.handleReviewerStatus);
router.delete('/:userId', verifyToken, verifyRole(['admin']), userController.deleteUser);

export default router;
