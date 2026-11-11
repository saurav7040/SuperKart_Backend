const express = require("express");
const router = express.Router();
const contestController = require("../controllers/contestController");
const authMiddleware = require("../middleware/authMiddleware");

// Public API
router.get("/my-active", contestController.getMyActiveContest);

// Protected APIs
router.post("/join", authMiddleware, contestController.joinContest);
router.post("/scratch", authMiddleware, contestController.scratchVoucher);

module.exports = router;
