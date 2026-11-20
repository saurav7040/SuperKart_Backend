const crypto = require("crypto");
const { pool } = require("../config/db");

// Dynamic Delivery Date Helper (Calculates NOW + 4 Days dynamically)
const getDynamicDeliveryDate = (createdAt) => {
    const deliveryDate = createdAt ? new Date(createdAt) : new Date();
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
            discountAmount,
            superCoinsUsed
        } = req.body;

        if (superCoinsUsed && parseInt(superCoinsUsed) > 0) {
            const coinsToDeduct = parseInt(superCoinsUsed);
            await client.query(
                "UPDATE users SET coins = GREATEST(0, coins - $1), coins_balance = GREATEST(0, coins_balance - $1) WHERE id = $2",
                [coinsToDeduct, userId]
            );
        }

        if (!items || !deliveryAddress || !paymentMethod || !orderTotal) {
            return res.status(400).json({
                success: false,
                message: "Items, delivery address, payment method, and order total are required"
            });
        }

        // Generate clean Order ID e.g. SK-849201
        const orderId = "SK-" + crypto.randomInt(100000, 999999).toString();
        const estimatedDelivery = getDynamicDeliveryDate(new Date());

        await client.query("BEGIN");

        // Insert Order into PostgreSQL
        await client.query(
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
// 2. GET USER PAST & LIVE ORDERS (MY ORDERS TRACKING)
// GET /api/v1/orders/my-orders
// ======================================
const getMyOrders = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        if (!userId) {
            return res.status(200).json({
                success: true,
                message: "No orders for guest user",
                orders: []
            });
        }

        const result = await pool.query(
            "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        // Products lookup for rich images & titles
        const productsRes = await pool.query("SELECT id, title, subtitle, image_url, regular_price FROM products");
        const productMap = {};
        productsRes.rows.forEach(p => {
            productMap[p.id] = p;
        });

        const formattedOrders = result.rows.map(row => {
            const rawItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            const enrichedItems = rawItems.map(item => {
                const prod = productMap[item.productId || item.id] || {};
                return {
                    productId: item.productId || item.id || 'shoe_1',
                    title: item.title || prod.title || 'Nike Air Force 1',
                    subtitle: item.subtitle || prod.subtitle || 'CHICAGO EDITION',
                    imageUrl: item.imageUrl || prod.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                    quantity: item.quantity || 1,
                    selectedSize: item.selectedSize || 'IND-8',
                    price: parseFloat(item.price || prod.regular_price || 3599.0),
                    isGrandPrize: item.isGrandPrize || (row.id.startsWith('SK-WIN-'))
                };
            });

            const isGrandPrizeOrder = row.id.startsWith('SK-WIN-') || row.payment_method === 'GRAND_PRIZE_FREE' || row.payment_method === 'CONTEST_ENTRY_PAID_FREE_DISPATCH';
            const statusUpper = (row.status || 'CONFIRMED').toUpperCase();

            let trackingStep = 1;
            if (statusUpper === 'DELIVERED') trackingStep = 4;
            else if (statusUpper === 'OUT FOR DELIVERY') trackingStep = 3;
            else if (statusUpper === 'SHIPPED') trackingStep = 2;

            return {
                id: row.id,
                isGrandPrizeOrder: isGrandPrizeOrder,
                items: enrichedItems,
                deliveryAddress: typeof row.delivery_address === 'string' ? JSON.parse(row.delivery_address) : row.delivery_address,
                paymentMethod: row.payment_method,
                orderTotal: parseFloat(row.order_total),
                discountAmount: parseFloat(row.discount_amount || 0),
                status: statusUpper,
                trackingStep: trackingStep,
                estimatedDelivery: getDynamicDeliveryDate(row.created_at),
                createdAt: row.created_at
            };
        });

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

// ======================================
// 3. ADMIN / TEST API: UPDATE ORDER TRACKING STATUS
// POST /api/v1/orders/admin/update-status
// ======================================
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!orderId || !status) {
            return res.status(400).json({
                success: false,
                message: "orderId and status are required"
            });
        }

        const validStatuses = ["CONFIRMED", "SHIPPED", "OUT FOR DELIVERY", "DELIVERED"];
        const normalizedStatus = status.toUpperCase();

        if (!validStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Valid values: ${validStatuses.join(", ")}`
            });
        }

        // Update status in PostgreSQL orders table
        const result = await pool.query(
            "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
            [normalizedStatus, orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Order #${orderId} not found`
            });
        }

        const order = result.rows[0];

        // Insert notification update for customer
        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                order.user_id,
                `📦 Order Status Updated: ${normalizedStatus}`,
                `Your order #${orderId} is now ${normalizedStatus}.`,
                "order",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: `Order #${orderId} status updated to ${normalizedStatus}`,
            orderId: orderId,
            status: normalizedStatus,
            trackingStep: normalizedStatus === 'DELIVERED' ? 4 : (normalizedStatus === 'OUT FOR DELIVERY' ? 3 : (normalizedStatus === 'SHIPPED' ? 2 : 1))
        });

    } catch (error) {
        console.error("Update Order Status Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to update order status"
        });
    }
};

module.exports = {
    placeOrder,
    getMyOrders,
    updateOrderStatus
};
