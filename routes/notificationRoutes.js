const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notificationController");

// Attach Authentication Middleware so req.user.userId is always decoded from JWT!
router.use(authMiddleware);

// Protected Notification APIs
router.get("/", notificationController.getNotifications);
router.put("/mark-read", notificationController.markAllAsRead);
router.put("/:id/mark-read", notificationController.markSingleAsRead);
router.delete("/:id", notificationController.deleteNotification);
router.post("/", notificationController.createNotification);

module.exports = router;
