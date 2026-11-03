const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const userController = require("../controllers/userController");

// Check imported functions
console.log("User Controller:", {
    getProfile: typeof userController.getProfile,
    updateProfile: typeof userController.updateProfile,
    requestPasswordOtp: typeof userController.requestPasswordOtp,
    changePassword: typeof userController.changePassword,
    authMiddleware: typeof authMiddleware
});

// Authentication required for all user APIs
router.use(authMiddleware);

// User APIs
router.get("/profile", userController.getProfile);

router.put("/profile", userController.updateProfile);

router.post(
    "/change-password/request-otp",
    userController.requestPasswordOtp
);

router.put(
    "/change-password",
    userController.changePassword
);

module.exports = router;