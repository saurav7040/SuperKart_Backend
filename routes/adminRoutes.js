const express = require("express");
const router = express.Router();
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");
const adminController = require("../controllers/adminController");

// Public Admin Auth Routes
router.post("/auth/login", adminController.adminLogin);

// Protected Admin Routes (Requires Admin JWT Token)
router.use(adminAuthMiddleware);

router.get("/auth/me", adminController.getAdminMe);
router.get("/dashboard", adminController.getAdminDashboard);
router.get("/users", adminController.getAdminUsers);
router.patch("/users/:id/status", adminController.updateUserStatus);
router.get("/products", adminController.getAdminProducts);
router.post("/products", adminController.createAdminProduct);
router.put("/products/:id", adminController.updateAdminProduct);
router.delete("/products/:id", adminController.deleteAdminProduct);
router.patch("/products/:id/status", adminController.updateProductStatus);

// Admin Contest Management Routes
router.get("/contests", adminController.getAdminContests);
router.post("/contests", adminController.createAdminContest);
router.put("/contests/:id/extend", adminController.extendAdminContest);
router.delete("/contests/:id", adminController.deleteAdminContest);

router.get("/orders", adminController.getAdminOrders);
router.get("/referrals", adminController.getAdminReferrals);

module.exports = router;
