const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const supportController = require("../controllers/supportController");

// Authentication required for support dispatch
router.use(authMiddleware);

router.get("/config", supportController.getSupportConfig);
router.post("/dispatch-whatsapp", supportController.dispatchWhatsAppTicket);

module.exports = router;
