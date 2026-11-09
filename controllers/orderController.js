const crypto = require("crypto");
const { pool } = require("../config/db");

// Dynamic Delivery Date Helper (Calculates NOW + 4 Days dynamically)
const getDynamicDeliveryDate = () => {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 4);

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const dayName = days[deliveryDate.getDay()];
    const dayNum = String(deliveryDate.getDate()).padStart(2, '0');
    const monthName = months[deliveryDate.getMonth()];

    return `Delivered by ${dayName}, ${dayNum}th ${monthName}`;
};

// ======================================
// 1. PLACE NEW ORDER (STEP 3 CHECKOUT)
// POST /api/v1/orders/place-order
// ======================================
const placeOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.userId;
        const {
            items,
            deliveryAddress,
            paymentMethod,
            orderTotal,
            discountAmount
        } = req.body;

        if (!items || !deliveryAddress || !paymentMethod || !orderTotal) {
            return res.status(400).json({
                success: false,
                message: "Items, delivery address, payment method, and order total are required"
            });
        }

        // Generate clean Order ID e.g. SK-849201
        const orderId = "SK-" + crypto.randomInt(100000, 999999).toString();
        const estimatedDelivery = getDynamicDeliveryDate();

        await client.query("BEGIN");

        // Insert Order into PostgreSQL
        const orderResult = await client.query(
            `INSERT INTO orders
            (id, user_id, items, delivery_address, payment_method, order_total, discount_amount, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                orderId,
                userId,
                JSON.stringify(items),
                JSON.stringify(deliveryAddress),
                paymentMethod,
                orderTotal,
                discountAmount || 0,
                "CONFIRMED"
            ]
        );

        // Clear user's cart in PostgreSQL user_cart table
        await client.query("DELETE FROM user_cart WHERE user_id = $1", [userId]);

        // Insert Order Confirmation Notification
        await client.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "🎉 Order Confirmed!",
                `Your order #${orderId} for ₹${orderTotal} has been placed successfully. ${estimatedDelivery}.`,
                "order",
                "Just now"
            ]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: "Order placed successfully!",
            orderId: orderId,
            orderTotal: parseFloat(orderTotal),
            paymentMethod: paymentMethod,
            status: "CONFIRMED",
            estimatedDelivery: estimatedDelivery
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Place Order Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to place order"
        });
    } finally {
        client.release();
    }
};

// ======================================
// 2. GET USER PAST ORDERS
// GET /api/v1/orders/my-orders
// ======================================
const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        const formattedOrders = result.rows.map(row => ({
            id: row.id,
            items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
            deliveryAddress: typeof row.delivery_address === 'string' ? JSON.parse(row.delivery_address) : row.delivery_address,
            paymentMethod: row.payment_method,
            orderTotal: parseFloat(row.order_total),
            discountAmount: parseFloat(row.discount_amount),
            status: row.status,
            createdAt: row.created_at
        }));

        return res.status(200).json({
            success: true,
            message: "My orders fetched successfully",
            orders: formattedOrders
        });

    } catch (error) {
        console.error("Get My Orders Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch order history"
        });
    }
};

module.exports = {
    placeOrder,
    getMyOrders
};
