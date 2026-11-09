const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");
const authMiddleware = require("../middleware/authMiddleware");

// Public Pincode Lookup API
router.get("/pincode/:pincode", locationController.getPincodeLocation);

// User Location Update API (Protected with JWT Auth Middleware!)
router.put("/user-location", authMiddleware, locationController.updateUserLocation);

module.exports = router;
