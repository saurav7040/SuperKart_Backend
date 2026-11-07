const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");

// Public & Protected APIs
router.get("/", notificationController.getNotifications);
router.put("/mark-read", notificationController.markAllAsRead);
router.post("/", notificationController.createNotification);

module.exports = router;
