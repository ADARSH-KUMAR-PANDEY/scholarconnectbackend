import express from 'express';
import * as authController from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register-reviewer', authController.registerReviewer);
router.post('/login', authController.login);
router.post('/forgotpassword', authController.forgotPassword);
router.put('/resetpassword/:resetToken', authController.resetPassword);
router.post('/register-admin', authController.registerAdmin); // Be careful with this in production

export default router;
