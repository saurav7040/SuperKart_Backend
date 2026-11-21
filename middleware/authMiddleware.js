const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authorization token required"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Verify live user active status in PostgreSQL database
        const userRes = await pool.query(
            "SELECT id, is_active FROM users WHERE id = $1",
            [decoded.userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User account no longer exists"
            });
        }

        const user = userRes.rows[0];

        if (user.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Your account has been suspended by administrator 🔒"
            });
        }

        req.user = {
            userId: decoded.userId
        };

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = authMiddleware;
