
const express = require("express");
const { pool } = require("../config/db");

const router = express.Router();

// GET API: Check PostgreSQL database
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM products) AS total_products,
                (SELECT COUNT(*) FROM referrals) AS total_referrals,
                (SELECT COUNT(*) FROM orders) AS total_orders
        `);

        res.status(200).json({
            success: true,
            message: "SuperKart Database Connected Successfully!",
            database: "superkart_db",
            statistics: result.rows[0]
        });

    } catch (error) {
        console.error("Database API Error:", error.message);

        res.status(500).json({
            success: false,
            message: "Database query failed"
        });
    }
});

module.exports = router;
