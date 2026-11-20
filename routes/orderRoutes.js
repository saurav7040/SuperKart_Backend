const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");

// Unprotected Admin test route (for testing status changes)
router.post("/admin/update-status", orderController.updateOrderStatus);

// Authentication required for user operations
router.use(authMiddleware);

router.post("/place-order", orderController.placeOrder);
router.get("/my-orders", orderController.getMyOrders);

module.exports = router;
