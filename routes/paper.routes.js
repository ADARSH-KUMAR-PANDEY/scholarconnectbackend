import express from 'express';
import * as paperController from '../controllers/paper.controller.js';
import { verifyToken, verifyRole } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Middleware to populate req.user if token exists but NOT error if not
const optionalAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET);
            req.user = verified;
        } catch (e) {
            // Ignore invalid token for optional auth, or warn.
        }
    }
    next();
};

// Public/Author routes
router.get('/published', paperController.getPublishedPapers);
router.get('/debug', paperController.getDebugPapers);
router.get('/pdf/:paperId', paperController.getPdfUrl);  // Get signed PDF URL
router.get('/stream/:paperId', paperController.streamPdf);  // Stream PDF through server
router.post('/submit', optionalAuth, upload.single('file'), paperController.submitPaper);
router.get('/my-papers', verifyToken, verifyRole(['author']), paperController.getMyPapers);

// Admin Routes
router.get('/all', verifyToken, verifyRole(['admin']), paperController.getAllPapers);
router.post('/assign', verifyToken, verifyRole(['admin']), paperController.assignReviewer);
router.post('/remove-reviewer', verifyToken, verifyRole(['admin']), paperController.removeReviewer);
router.post('/decision', verifyToken, verifyRole(['admin']), paperController.finalDecision);
router.delete('/:paperId', verifyToken, verifyRole(['admin']), paperController.deletePaper);
router.post('/unpublish/:paperId', verifyToken, verifyRole(['admin']), paperController.unpublishPaper);


// Reviewer Routes
router.get('/assigned', verifyToken, verifyRole(['reviewer']), paperController.getAssignedPapers);
router.post('/review', verifyToken, verifyRole(['reviewer']), paperController.submitReview);

export default router;
