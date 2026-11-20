const { pool } = require("../config/db");

// Dynamic Time Ago Helper Function
const calculateTimeAgo = (createdAt) => {
    if (!createdAt) return 'Just now';
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
};

// ======================================
// 1. GET ALL USER NOTIFICATIONS (With Dynamic Live Time-Ago Calculation!)
// GET /api/v1/notifications
// ======================================
const getNotifications = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        let query = "SELECT * FROM notifications ORDER BY created_at DESC";
        let params = [];

        if (userId) {
            query = "SELECT * FROM notifications WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC";
            params = [userId];
        }

        const result = await pool.query(query, params);

        const formattedNotifications = result.rows.map(row => ({
            id: String(row.id),
            title: row.title,
            body: row.body,
            timeAgo: calculateTimeAgo(row.created_at), // Dynamic live calculation!
            isRead: row.is_read || false,
            type: row.type || 'general'
        }));

        return res.status(200).json({
            success: true,
            message: "Notifications fetched successfully",
            notifications: formattedNotifications
        });

    } catch (error) {
        console.error("Get Notifications Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch notifications"
        });
    }
};

// ======================================
// 2. MARK ALL NOTIFICATIONS AS READ
// PUT /api/v1/notifications/mark-read
// ======================================
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        if (userId) {
            await pool.query(
                "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 OR user_id IS NULL",
                [userId]
            );
        } else {
            await pool.query("UPDATE notifications SET is_read = TRUE");
        }

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read"
        });

    } catch (error) {
        console.error("Mark Read Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to mark notifications as read"
        });
    }
};

// ======================================
// 3. CREATE NOTIFICATION (ADMIN API - Automatically assigns NOW() timestamp)
// POST /api/v1/notifications
// ======================================
const createNotification = async (req, res) => {
    try {
        const { title, body, type, userId } = req.body;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: "Title and body are required"
            });
        }

        const result = await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING *`,
            [
                userId || null,
                title.trim(),
                body.trim(),
                type || "general",
                "Just now"
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Notification created successfully",
            notification: result.rows[0]
        });

    } catch (error) {
        console.error("Create Notification Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to create notification"
        });
    }
};

// ======================================
// 4. MARK SINGLE NOTIFICATION AS READ
// PUT /api/v1/notifications/:id/mark-read
// ======================================
const markSingleAsRead = async (req, res) => {
    try {
        const notifId = req.params.id;
        const userId = req.user ? req.user.userId : null;

        if (userId) {
            await pool.query(
                "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)",
                [notifId, userId]
            );
        } else {
            await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [notifId]);
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read"
        });

    } catch (error) {
        console.error("Mark Single Read Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to mark notification as read"
        });
    }
};

// ======================================
// 5. DELETE NOTIFICATION
// DELETE /api/v1/notifications/:id
// ======================================
const deleteNotification = async (req, res) => {
    try {
        const notifId = req.params.id;
        const userId = req.user ? req.user.userId : null;

        if (userId) {
            await pool.query(
                "DELETE FROM notifications WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)",
                [notifId, userId]
            );
        } else {
            await pool.query("DELETE FROM notifications WHERE id = $1", [notifId]);
        }

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });

    } catch (error) {
        console.error("Delete Notification Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to delete notification"
        });
    }
};

module.exports = {
    getNotifications,
    markAllAsRead,
    createNotification,
    markSingleAsRead,
    deleteNotification
};
