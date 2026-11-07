const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authController = require("../controllers/authController");

// Public APIs
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);

// Forgot Password APIs
router.post("/forgot-password/send-otp", authController.forgotPasswordSendOtp);
router.post("/forgot-password/reset", authController.forgotPasswordReset);

// Protected API
router.get(
    "/me",
    authMiddleware,
    authController.getMe
);

module.exports = router;
