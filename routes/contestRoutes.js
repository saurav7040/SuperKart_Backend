const express = require("express");
const router = express.Router();
const contestController = require("../controllers/contestController");
const authMiddleware = require("../middleware/authMiddleware");

// Protected APIs (Requires JWT Bearer Token!)
router.get("/my-active", authMiddleware, contestController.getMyActiveContest);
router.get("/history", authMiddleware, contestController.getContestHistory);
router.post("/join", authMiddleware, contestController.joinContest);
router.post("/scratch", authMiddleware, contestController.scratchVoucher);
router.post("/claim-prize", authMiddleware, contestController.claimPrize);

// Non-Winner Post-Contest Redemption APIs
router.post("/claim-cashback", authMiddleware, contestController.claimCashback);
router.post("/claim-supercoins", authMiddleware, contestController.claimSuperCoins);
router.post("/claim-buy-remaining", authMiddleware, contestController.claimBuyRemaining);

// Admin Control API (Set winners count & trigger draw!)
router.post("/admin/set-winners", contestController.setAdminWinnersCount);

module.exports = router;
