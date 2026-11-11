const { pool } = require("../config/db");

// ======================================
// 1. GET MY ACTIVE CONTEST ENTRY
// GET /api/v1/contests/my-active
// ======================================
const getMyActiveContest = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;

        if (!userId) {
            return res.status(200).json({
                success: true,
                message: "No active contest for guest user",
                contest: null
            });
        }

        // Query active contest joined by user or latest active contest
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
            LIMIT 1
        `;

        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No active contests joined yet",
                contest: null
            });
        }

        const row = result.rows[0];
        const formattedContest = {
            id: row.id,
            shoeTitle: row.title,
            shoeSubtitle: row.subtitle,
            imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
            winOfferPrice: parseFloat(row.entry_fee),
            joinedUsersCount: parseInt(row.joined_count || 2846),
            unlocksAt: row.unlocks_at,
            isScratchable: row.is_scratchable || false,
            isScratched: row.is_scratched || false,
            isWinner: row.is_winner || false,
            voucherAmount: parseFloat(row.voucher_amount || 200.0)
        };

        return res.status(200).json({
            success: true,
            message: "Active contest pass fetched successfully",
            contest: formattedContest
        });

    } catch (error) {
        console.error("Get Active Contest Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch active contest"
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

        const effectiveContestId = contestId || 'cnt_sole_mates_101';
        const fee = Math.round(parseFloat(entryFee || 100.0));

        // Record user entry in user_contest_entries
        await pool.query(
            `INSERT INTO user_contest_entries (user_id, contest_id, entry_fee_paid, voucher_claimed_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, contest_id) DO NOTHING`,
            [userId, effectiveContestId, fee, fee * 2]
        );

        // Increment joined count in contests
        await pool.query(
            "UPDATE contests SET joined_count = joined_count + 1 WHERE id = $1",
            [effectiveContestId]
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
            contestId: effectiveContestId
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
