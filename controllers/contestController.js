const crypto = require("crypto");
const { pool } = require("../config/db");

// ======================================
// 1. GET MY ACTIVE UN-SCRATCHED CONTEST ENTRIES
// GET /api/v1/contests/my-active
// ======================================
const getMyActiveContest = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        if (!userId) {
            return res.status(200).json({
                success: true,
                message: "No active contest for guest user",
                contests: [],
                contest: null
            });
        }

        // Auto-Trigger Winner Selection Algorithm for any expired active contests!
        await triggerWinnerDrawAlgorithm();

        // Query ALL active contests joined by user that are NOT scratched yet!
        let query = `
            SELECT c.id, c.title, c.subtitle, c.entry_fee, c.voucher_amount,
                   c.unlocks_at, c.status,
                   (SELECT COUNT(*) FROM user_contest_entries WHERE contest_id = c.id) AS real_joined_count,
                   p.image_url,
                   e.is_scratchable, e.is_scratched, e.is_winner, e.voucher_code
            FROM user_contest_entries e
            JOIN contests c ON e.contest_id = c.id
            LEFT JOIN products p ON c.product_id = p.id
            WHERE e.user_id = $1 AND (c.status = 'ACTIVE' OR c.status = 'LOCKED_SCRATCHABLE') AND e.is_scratched = FALSE
            ORDER BY e.created_at DESC
        `;

        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No active contests joined yet",
                contests: [],
                contest: null
            });
        }

        const formattedContests = result.rows.map(row => {
            const unlocksAtDate = new Date(row.unlocks_at);
            const isUnlocked = unlocksAtDate <= new Date() || row.is_scratchable;

            return {
                id: row.id,
                shoeTitle: row.title,
                shoeSubtitle: row.subtitle,
                imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                winOfferPrice: parseFloat(row.entry_fee),
                joinedUsersCount: Math.max(1, parseInt(row.real_joined_count || 1)),
                unlocksAt: row.unlocks_at,
                isScratchable: isUnlocked,
                isScratched: row.is_scratched || false,
                isWinner: row.is_winner || false,
                voucherAmount: parseFloat(row.voucher_amount || 200.0),
                voucherCode: row.voucher_code || 'SUPER200'
            };
        });

        return res.status(200).json({
            success: true,
            message: "Active contest passes fetched successfully",
            contests: formattedContests,
            contest: formattedContests[0]
        });

    } catch (error) {
        console.error("Get Active Contest Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch active contests"
        });
    }
};

// ======================================
// 2. RANDOM WINNER SELECTION ALGORITHM ENGINE
// ======================================
const triggerWinnerDrawAlgorithm = async () => {
    try {
        // Find contests whose unlocks_at has passed but are still marked ACTIVE
        const expiredContests = await pool.query(
            "SELECT id FROM contests WHERE unlocks_at <= NOW() AND status = 'ACTIVE'"
        );

        for (const contest of expiredContests.rows) {
            const contestId = contest.id;

            // Pick 1 random lucky winner from user_contest_entries using PostgreSQL RANDOM()
            const winnerQuery = await pool.query(
                `SELECT id, user_id FROM user_contest_entries
                 WHERE contest_id = $1
                 ORDER BY RANDOM() LIMIT 1`,
                [contestId]
            );

            if (winnerQuery.rows.length > 0) {
                const winnerEntry = winnerQuery.rows[0];

                // 1. Mark winner entry
                await pool.query(
                    `UPDATE user_contest_entries
                     SET is_winner = TRUE, is_scratchable = TRUE, voucher_code = 'WINNER_GRAND_PRIZE'
                     WHERE id = $1`,
                    [winnerEntry.id]
                );

                // 2. Mark all other entries as scratchable for 2x voucher refund!
                await pool.query(
                    `UPDATE user_contest_entries
                     SET is_winner = FALSE, is_scratchable = TRUE, voucher_code = 'SUPER200'
                     WHERE contest_id = $1 AND id != $2`,
                    [contestId, winnerEntry.id]
                );

                // 3. Update contest status to LOCKED_SCRATCHABLE
                await pool.query(
                    "UPDATE contests SET status = 'LOCKED_SCRATCHABLE' WHERE id = $1",
                    [contestId]
                );

                // 4. Dispatch Winner Notification
                await pool.query(
                    `INSERT INTO notifications (user_id, title, body, type, time_ago)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        winnerEntry.user_id,
                        "🏆 CONGRATULATIONS! YOU WON THE CONTEST!",
                        `You have been selected as the 1st Place Winner for Contest #${contestId}! Claim your prize now.`,
                        "contest",
                        "Just now"
                    ]
                );
            }
        }
    } catch (error) {
        console.error("Winner Selection Algorithm Error:", error.message);
    }
};

// ======================================
// 3. JOIN A FLASH CONTEST
// POST /api/v1/contests/join
// ======================================
const joinContest = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId, productId, entryFee } = req.body;

        const pId = productId || 'shoe_1';
        const fee = Math.round(parseFloat(entryFee || 100.0));
        const cId = contestId || `cnt_${pId}`;

        // Get product details
        const productRes = await pool.query("SELECT * FROM products WHERE id = $1", [pId]);
        const product = productRes.rows[0];

        const title = product ? product.title.toUpperCase() : 'SOLE MATES.';
        const subtitle = product ? (product.subtitle || 'LIMITED EDITION').toUpperCase() : 'THE SNEAKER EDIT';

        // Upsert contest campaign for this product in contests table
        await pool.query(
            `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, joined_count, unlocks_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, 1, NOW() + INTERVAL '2 hours 14 minutes', 'ACTIVE')
             ON CONFLICT (id) DO UPDATE SET joined_count = contests.joined_count + 1`,
            [cId, pId, title, subtitle, fee, fee * 2]
        );

        // Record user entry in user_contest_entries table
        await pool.query(
            `INSERT INTO user_contest_entries (user_id, contest_id, entry_fee_paid, voucher_claimed_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, contest_id) DO NOTHING`,
            [userId, cId, fee, fee * 2]
        );

        // Dispatch Notification
        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "⚡ Flash Contest Slot Joined!",
                `You have successfully booked your slot for ₹${fee}. Contest unlocks soon!`,
                "contest",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Joined contest successfully!",
            contestId: cId
        });

    } catch (error) {
        console.error("Join Contest Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to join contest"
        });
    }
};

// ======================================
// 4. SCRATCH & CLAIM REWARD VOUCHER (One-time scratch restriction & moves to history!)
// POST /api/v1/contests/scratch
// ======================================
const scratchVoucher = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId } = req.body;

        const effectiveContestId = contestId || 'cnt_shoe_1';

        const result = await pool.query(
            `UPDATE user_contest_entries
             SET is_scratched = TRUE
             WHERE user_id = $1 AND contest_id = $2
             RETURNING *`,
            [userId, effectiveContestId]
        );

        const entry = result.rows[0];
        const isWinner = entry ? entry.is_winner : false;
        const voucherCode = entry ? (entry.voucher_code || 'SUPER200') : 'SUPER200';

        return res.status(200).json({
            success: true,
            message: isWinner ? "Grand prize claimed!" : "2X Voucher claimed successfully!",
            isWinner: isWinner,
            voucherAmount: entry ? parseFloat(entry.voucher_claimed_amount) : 200.0,
            voucherCode: voucherCode
        });

    } catch (error) {
        console.error("Scratch Voucher Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to scratch voucher"
        });
    }
};

// ======================================
// 5. CLAIM WINNER GRAND PRIZE & CONFIRM DELIVERY ADDRESS
// POST /api/v1/contests/claim-prize
// ======================================
const claimPrize = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.userId;
        const { contestId, deliveryAddress } = req.body;

        if (!contestId || !deliveryAddress) {
            return res.status(400).json({
                success: false,
                message: "contestId and deliveryAddress are required"
            });
        }

        // Verify user is the winner of this contest
        const entryRes = await client.query(
            "SELECT * FROM user_contest_entries WHERE contest_id = $1 AND user_id = $2 AND is_winner = TRUE",
            [contestId, userId]
        );

        if (entryRes.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "User is not the winner of this contest"
            });
        }

        await client.query("BEGIN");

        // Get contest product details
        const contestRes = await client.query("SELECT * FROM contests WHERE id = $1", [contestId]);
        const contest = contestRes.rows[0];
        const productId = contest ? contest.product_id : 'shoe_1';

        // Upsert contest_winners record
        await client.query(
            `INSERT INTO contest_winners (contest_id, user_id, product_id, claim_status, delivery_address)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (contest_id, user_id)
             DO UPDATE SET claim_status = 'ADDRESS_CONFIRMED', delivery_address = EXCLUDED.delivery_address`,
            [contestId, userId, productId, 'ADDRESS_CONFIRMED', JSON.stringify(deliveryAddress)]
        );

        // Generate clean Order ID e.g. SK-WIN-849201 for Admin Dispatch
        const orderId = "SK-WIN-" + crypto.randomInt(100000, 999999).toString();

        // Create FREE Winner Order Record in orders table
        await client.query(
            `INSERT INTO orders (id, user_id, items, delivery_address, payment_method, order_total, discount_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                orderId,
                userId,
                JSON.stringify([{ productId: productId, quantity: 1, isGrandPrize: true }]),
                JSON.stringify(deliveryAddress),
                'GRAND_PRIZE_FREE',
                0.00,
                0.00,
                'CONFIRMED'
            ]
        );

        // Dispatch Prize Confirmation Notification
        await client.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "📦 Prize Dispatch In Progress!",
                `Your free 1st Place Winner Order #${orderId} has been confirmed for delivery. Admin is processing dispatch!`,
                "order",
                "Just now"
            ]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Prize claimed successfully! Your product order has been dispatched for delivery.",
            orderId: orderId,
            claimStatus: "ADDRESS_CONFIRMED",
            estimatedDelivery: "Delivered by Wednesday, 04th Nov"
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Claim Prize Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to claim prize"
        });
    } finally {
        client.release();
    }
};

// ======================================
// 6. GET COMPLETED CONTEST HISTORY FOR USER
// GET /api/v1/contests/history
// ======================================
const getContestHistory = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        if (!userId) {
            return res.status(200).json({
                success: true,
                message: "No contest history for guest user",
                history: []
            });
        }

        const result = await pool.query(
            `SELECT c.id, c.title, c.subtitle, c.entry_fee, c.voucher_amount,
                    p.image_url,
                    e.is_winner, e.voucher_code, e.created_at
             FROM user_contest_entries e
             JOIN contests c ON e.contest_id = c.id
             LEFT JOIN products p ON c.product_id = p.id
             WHERE e.user_id = $1 AND e.is_scratched = TRUE
             ORDER BY e.created_at DESC`,
            [userId]
        );

        const formattedHistory = result.rows.map(row => ({
            id: String(row.id),
            shoeTitle: row.title,
            shoeSubtitle: row.subtitle,
            imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
            winOfferPrice: parseFloat(row.entry_fee),
            voucherAmount: parseFloat(row.voucher_amount || 200.0),
            voucherCode: row.voucher_code || 'SUPER200',
            isWinner: row.is_winner || false,
            completedAt: 'Just now'
        }));

        return res.status(200).json({
            success: true,
            message: "Contest history fetched successfully",
            history: formattedHistory
        });

    } catch (error) {
        console.error("Get Contest History Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch contest history"
        });
    }
};

module.exports = {
    getMyActiveContest,
    joinContest,
    scratchVoucher,
    claimPrize,
    getContestHistory
};
