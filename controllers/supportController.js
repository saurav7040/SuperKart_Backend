const { pool } = require("../config/db");

// Configurable Support WhatsApp Number (Default: 8767249855 -> +918767249855)
const getSupportWhatsAppNumber = () => {
    let num = process.env.SUPPORT_WHATSAPP_NUMBER || "8767249855";
    num = num.replace(/[^0-9]/g, '');
    if (!num.startsWith("91") && num.length === 10) {
        num = "91" + num;
    }
    return num;
};

// Available Support Query Categories
const SUPPORT_CATEGORIES = [
    { id: 'delivery', title: 'Delivery related queries', icon: '🚚' },
    { id: 'refund', title: 'Refund related queries', icon: '💵' },
    { id: 'other', title: 'Other', icon: '❓' }
];

// ======================================
// 1. GET SUPPORT CONFIGURATION
// GET /api/v1/support/config
// ======================================
const getSupportConfig = async (req, res) => {
    try {
        const supportPhone = getSupportWhatsAppNumber();

        return res.status(200).json({
            success: true,
            whatsappNumber: supportPhone,
            displayPhone: `+91 ${supportPhone.substring(2)}`,
            categories: SUPPORT_CATEGORIES
        });

    } catch (error) {
        console.error("Get Support Config Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch support configuration"
        });
    }
};

// ======================================
// 2. DISPATCH WHATSAPP SUPPORT TICKET (Sanitizes & Logs in PostgreSQL)
// POST /api/v1/support/dispatch-whatsapp
// ======================================
const dispatchWhatsAppTicket = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { category, customQuery } = req.body;

        if (!category) {
            return res.status(400).json({
                success: false,
                message: "Category is required"
            });
        }

        // Fetch User Profile for WhatsApp Pre-filled message
        const userRes = await pool.query(
            "SELECT first_name, last_name, email, phone FROM users WHERE id = $1",
            [userId]
        );
        const user = userRes.rows[0];
        const userName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : `User #${userId}`;
        const userContact = user ? (user.phone || user.email || '') : '';

        // Sanitize Custom Query
        const sanitizedQuery = customQuery ? customQuery.trim().substring(0, 500) : '';

        const whatsappNumber = getSupportWhatsAppNumber();

        // Save Support Ticket Record in PostgreSQL for audit trail
        await pool.query(
            `INSERT INTO support_tickets (user_id, category, custom_query, whatsapp_number, status)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, category, sanitizedQuery, whatsappNumber, 'OPEN']
        );

        // Build Pre-formatted WhatsApp Message
        let messageText = `Hi SuperKart Support Team! 👋\n\n`;
        messageText += `*Name:* ${userName}\n`;
        messageText += `*User ID:* #${userId}\n`;
        if (userContact) messageText += `*Contact:* ${userContact}\n`;
        messageText += `*Category:* ${category}\n`;
        if (sanitizedQuery) messageText += `*Query Details:* ${sanitizedQuery}\n`;
        messageText += `\nPlease assist me with my request. Thank you!`;

        const encodedMessage = encodeURIComponent(messageText);
        const whatsappDeepLink = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

        return res.status(200).json({
            success: true,
            message: "Support ticket logged successfully!",
            whatsappNumber: whatsappNumber,
            whatsappDeepLink: whatsappDeepLink
        });

    } catch (error) {
        console.error("Dispatch WhatsApp Ticket Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to dispatch support ticket"
        });
    }
};

module.exports = {
    getSupportConfig,
    dispatchWhatsAppTicket
};
