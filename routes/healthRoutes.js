const express = require("express");

const router = express.Router();


// GET API - Check backend status
router.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "SuperKart Backend is Running!",
        status: "Healthy"
    });
});

module.exports = router;
