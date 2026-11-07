const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");
const authMiddleware = require("../middleware/authMiddleware");

// Public Pincode Lookup API
router.get("/pincode/:pincode", locationController.getPincodeLocation);

// User Location Update API
router.put("/user-location", locationController.updateUserLocation);

module.exports = router;
