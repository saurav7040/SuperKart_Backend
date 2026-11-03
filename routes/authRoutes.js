const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const authController = require("../controllers/authController");

console.log("Auth Controller:", {
    register: typeof authController.register,
    login: typeof authController.login,
    getMe: typeof authController.getMe,
    authMiddleware: typeof authMiddleware
});

// Public APIs
router.post("/register", authController.register);
router.post("/login", authController.login);

// Protected API
router.get(
    "/me",
    authMiddleware,
    authController.getMe
);

module.exports = router;