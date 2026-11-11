const { pool } = require("../config/db");

// ======================================
// 1. GET MY ACTIVE CONTEST ENTRIES (Supports multiple joined contests & real joined_count!)
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

        // Query ALL active contests joined by user
        let query = `
            SELECT c.id, c.title, c.subtitle, c.entry_fee, c.voucher_amount,
                   c.joined_count, c.unlocks_at, c.status,
                   p.image_url,
                   e.is_scratchable, e.is_scratched, e.is_winner
            FROM user_contest_entries e
            JOIN contests c ON e.contest_id = c.id
            LEFT JOIN products p ON c.product_id = p.id
            WHERE e.user_id = $1 AND c.status = 'ACTIVE'
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

        const formattedContests = result.rows.map(row => ({
            id: row.id,
            shoeTitle: row.title,
            shoeSubtitle: row.subtitle,
            imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
            winOfferPrice: parseFloat(row.entry_fee),
            joinedUsersCount: parseInt(row.joined_count || 1),
            unlocksAt: row.unlocks_at,
            isScratchable: row.is_scratchable || false,
            isScratched: row.is_scratched || false,
            isWinner: row.is_winner || false,
            voucherAmount: parseFloat(row.voucher_amount || 200.0)
        }));

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
// 2. JOIN A FLASH CONTEST
// POST /api/v1/contests/join
// ======================================
const joinContest = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId, productId, entryFee } = req.body;

        const pId = productId || 'shoe_1';
        const fee = Math.round(parseFloat(entryFee || 100.0));
        const cId = contestId || `cnt_${pId}_${userId}`;

        // Get product details
        const productRes = await pool.query("SELECT * FROM products WHERE id = $1", [pId]);
        const product = productRes.rows[0];

        const title = product ? product.title.toUpperCase() : 'SOLE MATES.';
        const subtitle = product ? (product.subtitle || 'LIMITED EDITION').toUpperCase() : 'THE SNEAKER EDIT';

        // Upsert contest campaign for this product (Real joined count starts at 1 and increments on conflict!)
        await pool.query(
            `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, joined_count, unlocks_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, 1, NOW() + INTERVAL '2 hours 14 minutes', 'ACTIVE')
             ON CONFLICT (id) DO UPDATE SET joined_count = contests.joined_count + 1`,
            [cId, pId, title, subtitle, fee, fee * 2]
        );

        // Record user entry in user_contest_entries
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
// 3. SCRATCH & CLAIM REWARD VOUCHER
// POST /api/v1/contests/scratch
// ======================================
const scratchVoucher = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId } = req.body;

        const effectiveContestId = contestId || 'cnt_sole_mates_101';

        await pool.query(
            `UPDATE user_contest_entries
             SET is_scratched = TRUE
             WHERE user_id = $1 AND contest_id = $2`,
            [userId, effectiveContestId]
        );

        return res.status(200).json({
            success: true,
            message: "Voucher scratched & claimed successfully!",
            voucherAmount: 200.0
        });

    } catch (error) {
        console.error("Scratch Voucher Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to scratch voucher"
        });
    }
};

module.exports = {
    getMyActiveContest,
    joinContest,
    scratchVoucher
};
