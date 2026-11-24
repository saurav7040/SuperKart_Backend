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

// Helper: Process Referral Reward when referred friend converts
const processReferralReward = async (userId) => {
    try {
        const userRes = await pool.query(
            "SELECT id, referred_by_id, is_referral_rewarded FROM users WHERE id = $1",
            [userId]
        );
        const user = userRes.rows[0];

        if (user && user.referred_by_id && !user.is_referral_rewarded) {
            const rewardAmount = parseFloat(process.env.REFERRAL_CASHBACK_REWARD || "200.00");

            await pool.query(
                "UPDATE users SET cashback_earned = COALESCE(cashback_earned, 0) + $1 WHERE id = $2",
                [rewardAmount, user.referred_by_id]
            );

            await pool.query(
                "UPDATE users SET is_referral_rewarded = TRUE WHERE id = $1",
                [userId]
            );

            await pool.query(
                `INSERT INTO notifications (user_id, title, body, type, time_ago)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    user.referred_by_id,
                    `🎉 ₹${Math.round(rewardAmount)} Referral Cashback Credited!`,
                    `You earned ₹${Math.round(rewardAmount)} cashback because your referred friend completed a purchase!`,
                    "reward",
                    "Just now"
                ]
            );
        }
    } catch (err) {
        console.error("Referral Bonus Error:", err.message);
    }
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

        const orderId = "SK-" + crypto.randomInt(100000, 999999).toString();
        const estimatedDelivery = getDynamicDeliveryDate(new Date());

        await client.query("BEGIN");

        // Check for duplicate order within last 15 seconds for same user and amount
        const duplicateCheck = await client.query(
            `SELECT id, order_total, payment_method, status FROM orders
             WHERE user_id = $1 AND ABS(order_total - $2) < 0.01
               AND created_at >= NOW() - INTERVAL '15 seconds'
             ORDER BY created_at DESC LIMIT 1`,
            [userId, orderTotal]
        );

        if (duplicateCheck.rows.length > 0) {
            await client.query("ROLLBACK");
            const existingOrder = duplicateCheck.rows[0];
            return res.status(200).json({
                success: true,
                message: "Order already placed successfully!",
                orderId: existingOrder.id,
                orderTotal: parseFloat(existingOrder.order_total),
                paymentMethod: existingOrder.payment_method,
                status: existingOrder.status,
                estimatedDelivery: estimatedDelivery
            });
        }

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

        // Update any pending non-winner redemption entries for this user
        await client.query(
            "UPDATE user_contest_entries SET claim_type = 'BUY_REMAINING', claim_status = 'COMPLETED', order_id = $1 WHERE user_id = $2 AND is_scratched = TRUE AND claim_status = 'PENDING'",
            [orderId, userId]
        );

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

        // Process referral cashback reward to Referrer User A when referred friend converts!
        await processReferralReward(userId);

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
// 2. GET MY ORDERS WITH ENRICHED PRODUCT & LIVE 4-STEP TRACKING
// GET /api/v1/orders/my-orders
// ======================================
const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        const orders = result.rows.map(row => {
            const currentStatus = (row.status || 'CONFIRMED').toUpperCase();
            const createdDate = row.created_at || new Date();
            const formattedDate = new Date(createdDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            let itemsList = [];
            try {
                itemsList = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            } catch (_) {
                itemsList = [];
            }

            let deliveryAddr = {};
            try {
                deliveryAddr = typeof row.delivery_address === 'string' ? JSON.parse(row.delivery_address) : (row.delivery_address || {});
            } catch (_) {
                deliveryAddr = {};
            }

            const item = itemsList.length > 0 ? itemsList[0] : {};
            const isGrandPrizeFree = item.isGrandPrize === true || parseFloat(row.order_total) === 0;
            const defaultAwb = row.awb_tracking_number || `DEL-${crypto.randomInt(1000000, 9999999)}`;

            const trackingSteps = [
                {
                    step: 'CONFIRMED',
                    title: 'Order Confirmed',
                    date: formattedDate,
                    isCompleted: true
                },
                {
                    step: 'SHIPPED',
                    title: 'Dispatched from Warehouse',
                    date: currentStatus === 'SHIPPED' || currentStatus === 'OUT FOR DELIVERY' || currentStatus === 'DELIVERED' ? `Dispatched via ${row.courier_name || 'Delhivery'} (${defaultAwb})` : 'Pending Dispatch',
                    isCompleted: currentStatus === 'SHIPPED' || currentStatus === 'OUT FOR DELIVERY' || currentStatus === 'DELIVERED'
                },
                {
                    step: 'OUT FOR DELIVERY',
                    title: 'Out for Delivery',
                    date: currentStatus === 'OUT FOR DELIVERY' || currentStatus === 'DELIVERED' ? 'Arriving Today' : 'Pending',
                    isCompleted: currentStatus === 'OUT FOR DELIVERY' || currentStatus === 'DELIVERED'
                },
                {
                    step: 'DELIVERED',
                    title: 'Delivered',
                    date: getDynamicDeliveryDate(createdDate),
                    isCompleted: currentStatus === 'DELIVERED'
                }
            ];

            return {
                id: row.id,
                orderTotal: parseFloat(row.order_total),
                discountAmount: parseFloat(row.discount_amount || 0),
                paymentMethod: row.payment_method || 'UPI',
                status: currentStatus,
                awbTrackingNumber: defaultAwb,
                courierName: row.courier_name || 'Delhivery',
                createdAt: row.created_at,
                isGrandPrizeFree: isGrandPrizeFree,
                productTitle: item.title || 'SuperKart Official Item',
                productSubtitle: item.subtitle || 'LIMITED EDITION',
                imageUrl: item.imageUrl || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                selectedSize: item.selectedSize || 'IND-8',
                quantity: item.quantity || 1,
                regularPrice: parseFloat(item.price || row.order_total || 3599),
                deliveryAddress: deliveryAddr,
                trackingSteps: trackingSteps
            };
        });

        return res.status(200).json({
            success: true,
            message: "Orders fetched successfully",
            orders: orders
        });

    } catch (error) {
        console.error("Get My Orders Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch orders"
        });
    }
};

// ======================================
// 3. ADMIN UPDATE ORDER STATUS & AWB TRACKING NUMBER
// POST /api/v1/orders/admin/update-status
// ======================================
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status, awbTrackingNumber, courierName } = req.body;

        if (!orderId || !status) {
            return res.status(400).json({
                success: false,
                message: "orderId and status are required"
            });
        }

        const validStatuses = ['CONFIRMED', 'SHIPPED', 'OUT FOR DELIVERY', 'DELIVERED'];
        const normalizedStatus = status.toUpperCase();

        if (!validStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be one of: CONFIRMED, SHIPPED, OUT FOR DELIVERY, DELIVERED"
            });
        }

        const awb = awbTrackingNumber ? awbTrackingNumber.trim() : `DEL-${crypto.randomInt(1000000, 9999999)}`;
        const courier = courierName ? courierName.trim() : 'Delhivery';

        const result = await pool.query(
            "UPDATE orders SET status = $1, awb_tracking_number = $2, courier_name = $3 WHERE id = $4 RETURNING *",
            [normalizedStatus, awb, courier, orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const order = result.rows[0];

        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                order.user_id,
                `📦 Order Status Update: ${normalizedStatus}`,
                `Your order #${orderId} is now ${normalizedStatus.toLowerCase()} via ${courier} (${awb}). Track live in My Orders.`,
                "order",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: `Order #${orderId} updated to ${normalizedStatus}`,
            order: order
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
