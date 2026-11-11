const express = require("express");
const router = express.Router();
const contestController = require("../controllers/contestController");
const authMiddleware = require("../middleware/authMiddleware");

// Protected APIs (Requires JWT Bearer Token!)
router.get("/my-active", authMiddleware, contestController.getMyActiveContest);
router.post("/join", authMiddleware, contestController.joinContest);
router.post("/scratch", authMiddleware, contestController.scratchVoucher);

module.exports = router;
