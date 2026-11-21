const express = require("express");
const router = express.Router();
const aboutController = require("../controllers/aboutController");

// Public API endpoint for About App information
router.get("/", aboutController.getAboutInfo);

module.exports = router;
