const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const authMiddleware = require("../middleware/authMiddleware");

// Public API
router.get("/empty-illustration", cartController.getEmptyCartIllustration);

// Authentication required for user Cart operations
router.use(authMiddleware);

router.get("/", cartController.getCart);
router.post("/add", cartController.addToCart);
router.put("/:id", cartController.updateCartQuantity);
router.delete("/:id", cartController.removeFromCart);
router.delete("/", cartController.clearCart);

module.exports = router;
