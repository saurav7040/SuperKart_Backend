const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

// Authentication required for all user APIs
router.use(authMiddleware);

// User Profile APIs
router.get("/profile", userController.getProfile);
router.put("/profile", userController.updateProfile);

// Mobile / Email Update with OTP Verification
router.post("/update-contact/send-otp", userController.updateContactSendOtp);
router.post("/update-contact/confirm", userController.updateContactConfirm);

// Password Change APIs
router.post("/change-password/request-otp", userController.requestPasswordOtp);
router.put("/change-password", userController.changePassword);

module.exports = router;
