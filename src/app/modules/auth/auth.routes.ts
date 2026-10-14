import express from 'express';
import AuthController from './auth.controller';
import validateRequest from '../../middlewares/validateRequest';
import { registerValidation, loginValidation, refreshTokenValidation, forgotPasswordValidation, resetPasswordValidation, updatePasswordValidation, verifyEmailValidation, resendVerificationValidation, sendOtpValidation, verifyOtpValidation } from './auth.validation';
import { authMiddleware, authorizeRoles } from '../../middlewares/auth';
import { rateLimit } from '../../middlewares/rateLimit';

const router = express.Router();

// Per-IP rate limits on sensitive endpoints (no external dep). Each limiter has its
// own bucket. Blunts brute-force (login / OTP guessing) and abuse of costly endpoints
// (password-reset email / OTP-SMS spam). Generous enough not to trip up real users.
const FIFTEEN_MIN = 15 * 60_000;
const loginLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 10, message: 'Too many login attempts. Please try again in a few minutes.' });
const registerLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 8, message: 'Too many attempts. Please try again in a few minutes.' });
const sendCodeLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 6, message: 'Too many requests. Please wait a few minutes before trying again.' });
const verifyCodeLimiter = rateLimit({ windowMs: FIFTEEN_MIN, max: 10, message: 'Too many attempts. Please wait a few minutes and try again.' });

router.post('/register', registerLimiter, validateRequest(registerValidation), AuthController.register);
router.post('/login', loginLimiter, validateRequest(loginValidation), AuthController.login);
router.post('/google', AuthController.googleLogin);
router.post('/refresh-token', validateRequest(refreshTokenValidation), AuthController.refreshToken);
router.post('/verify-email', validateRequest(verifyEmailValidation), AuthController.verifyEmail);
router.post('/resend-verification', sendCodeLimiter, validateRequest(resendVerificationValidation), AuthController.resendVerification);
router.post('/send-otp', sendCodeLimiter, validateRequest(sendOtpValidation), AuthController.sendOtp);
router.post('/verify-otp', verifyCodeLimiter, validateRequest(verifyOtpValidation), AuthController.verifyOtp);
router.post('/forgot-password', sendCodeLimiter, validateRequest(forgotPasswordValidation), AuthController.forgotPassword);
router.post('/reset-password', verifyCodeLimiter, validateRequest(resetPasswordValidation), AuthController.resetPassword);
router.post('/update-password', authMiddleware, validateRequest(updatePasswordValidation), AuthController.updatePassword);
router.get('/me', authMiddleware, AuthController.getMe);
router.post('/logout', AuthController.logout);
router.post('/login-as/:userId', authMiddleware, authorizeRoles('admin', 'superadmin'), AuthController.loginAs);

export const AuthRoutes = router;
