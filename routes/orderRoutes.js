const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");

// Authentication required for all Order operations
router.use(authMiddleware);

router.post("/place-order", orderController.placeOrder);
router.get("/my-orders", orderController.getMyOrders);

module.exports = router;
