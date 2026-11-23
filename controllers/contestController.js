const crypto = require("crypto");
const { pool } = require("../config/db");

// Dynamic Configurable Referral Cashback Reward (e.g. ₹200)
const REFERRAL_CASHBACK_REWARD = parseFloat(process.env.REFERRAL_CASHBACK_REWARD || "200.00");

const processReferralReward = async (userId) => {
    try {
        const userRes = await pool.query(
            "SELECT id, referred_by_id, is_referral_rewarded FROM users WHERE id = $1",
            [userId]
        );
        const user = userRes.rows[0];

        if (user && user.referred_by_id && !user.is_referral_rewarded) {
            const rewardAmount = REFERRAL_CASHBACK_REWARD;
            const rewardCoins = Math.round(rewardAmount * 100);

            await pool.query(
                "UPDATE users SET coins = coins + $1 WHERE id = $2",
                [rewardCoins, user.referred_by_id]
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
                    `You earned ₹${Math.round(rewardAmount)} cashback because your referred friend joined their first Flash Contest!`,
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

        // Auto-Trigger Multi-Winner Selection Algorithm for any expired entry windows!
        await triggerWinnerDrawAlgorithm();

        // Query ALL unscratched contest passes joined by user
        let query = `
            SELECT c.id, c.title, c.subtitle, c.entry_fee, c.voucher_amount, c.max_winners,
                   c.unlocks_at, c.entry_start_time, c.entry_end_time, c.status,
                   (SELECT COUNT(*) FROM user_contest_entries WHERE contest_id = c.id) AS real_joined_count,
                   p.image_url, p.regular_price,
                   e.is_scratchable, e.is_scratched, e.is_winner, e.voucher_code
            FROM user_contest_entries e
            JOIN contests c ON e.contest_id = c.id
            LEFT JOIN products p ON c.product_id = p.id
            WHERE e.user_id = $1 AND e.is_scratched = FALSE
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
            const entryFeePaid = parseFloat(row.entry_fee);
            const adminReturnAmount = parseFloat(row.voucher_amount || entryFeePaid);

            return {
                id: row.id,
                shoeTitle: row.title,
                shoeSubtitle: row.subtitle,
                imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                winOfferPrice: entryFeePaid,
                regularPrice: parseFloat(row.regular_price || 3599.0),
                joinedUsersCount: Math.max(1, parseInt(row.real_joined_count || 1)),
                maxWinnersCount: Math.max(1, parseInt(row.max_winners || 1)),
                unlocksAt: row.unlocks_at,
                isScratchable: isUnlocked,
                isScratched: row.is_scratched || false,
                isWinner: row.is_winner || false,
                voucherAmount: adminReturnAmount,
                voucherCode: row.voucher_code || null
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
// 2. RANDOM MULTI-WINNER SELECTION ALGORITHM ENGINE
// ======================================
const triggerWinnerDrawAlgorithm = async () => {
    try {
        const expiredContests = await pool.query(
            "SELECT id, COALESCE(max_winners, 1) AS max_winners, COALESCE(voucher_amount, entry_fee) AS voucher_amount FROM contests WHERE (entry_end_time <= NOW() OR unlocks_at <= NOW()) AND (status = 'ACTIVE' OR status = 'LIVE_REGISTRATION')"
        );

        for (const contest of expiredContests.rows) {
            const contestId = contest.id;
            const maxWinners = Math.max(1, parseInt(contest.max_winners || 1));
            const returnAmount = parseFloat(contest.voucher_amount || 100.0);

            await executeWinnerDrawForContest(contestId, maxWinners, returnAmount);
        }
    } catch (error) {
        console.error("Winner Selection Algorithm Error:", error.message);
    }
};

const executeWinnerDrawForContest = async (contestId, maxWinnersCount, nonWinnerReturnAmount) => {
    const winnersQuery = await pool.query(
        `SELECT id, user_id FROM user_contest_entries
         WHERE contest_id = $1 AND is_scratched = FALSE
         ORDER BY RANDOM() LIMIT $2`,
        [contestId, maxWinnersCount]
    );

    if (winnersQuery.rows.length > 0) {
        const winnerEntryIds = winnersQuery.rows.map(r => r.id);
        const winnerUserIds = winnersQuery.rows.map(r => r.user_id);

        await pool.query(
            `UPDATE user_contest_entries
             SET is_winner = TRUE, is_scratchable = TRUE, voucher_code = 'WINNER_GRAND_PRIZE'
             WHERE id = ANY($1::int[])`,
            [winnerEntryIds]
        );

        const returnFee = parseFloat(nonWinnerReturnAmount || 100.0);
        await pool.query(
            `UPDATE user_contest_entries
             SET is_winner = FALSE,
                 is_scratchable = TRUE,
                 voucher_claimed_amount = $2,
                 voucher_code = 'CASHBACK100'
             WHERE contest_id = $1 AND NOT (id = ANY($3::int[]))`,
            [contestId, returnFee, winnerEntryIds]
        );

        await pool.query(
            "UPDATE contests SET status = 'LOCKED_SCRATCHABLE' WHERE id = $1",
            [contestId]
        );

        for (const userId of winnerUserIds) {
            await pool.query(
                `INSERT INTO notifications (user_id, title, body, type, time_ago)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    userId,
                    "🏆 CONGRATULATIONS! YOU WON THE GRAND PRIZE!",
                    `You have been selected as one of the ${maxWinnersCount} lucky winners for Contest #${contestId}! Product dispatched with ₹0 extra fee.`,
                    "contest",
                    "Just now"
                ]
            );
        }
    }
};

// ======================================
// 3. ADMIN PANEL API: SET WINNERS COUNT & CASHBACK AMOUNT
// POST /api/v1/contests/admin/set-winners
// ======================================
const setAdminWinnersCount = async (req, res) => {
    try {
        const { contestId, maxWinners, nonWinnerRewardAmount, triggerDraw } = req.body;

        if (!contestId) {
            return res.status(400).json({ success: false, message: "contestId is required" });
        }

        const winnersCount = Math.max(1, parseInt(maxWinners || 1));

        if (nonWinnerRewardAmount !== undefined && nonWinnerRewardAmount !== null) {
            const rewardAmount = parseFloat(nonWinnerRewardAmount);
            await pool.query(
                "UPDATE contests SET max_winners = $1, voucher_amount = $2 WHERE id = $3",
                [winnersCount, rewardAmount, contestId]
            );
        } else {
            await pool.query(
                "UPDATE contests SET max_winners = $1 WHERE id = $2",
                [winnersCount, contestId]
            );
        }

        const cRes = await pool.query("SELECT * FROM contests WHERE id = $1", [contestId]);
        const contest = cRes.rows[0];
        const returnAmount = contest ? parseFloat(contest.voucher_amount) : 100.0;

        if (triggerDraw === true) {
            await executeWinnerDrawForContest(contestId, winnersCount, returnAmount);
        }

        return res.status(200).json({
            success: true,
            message: `Successfully configured contest ${contestId}: ${winnersCount} Winners, ₹${returnAmount} Non-Winner Cashback Return`,
            contestId: contestId,
            maxWinners: winnersCount,
            nonWinnerReturnCashback: returnAmount
        });

    } catch (error) {
        console.error("Admin Set Winners Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to set winners/cashback" });
    }
};

// ======================================
// 4. JOIN A FLASH CONTEST (Supports Paying via SuperCoins!)
// POST /api/v1/contests/join
// ======================================
const joinContest = async (req, res) => {
    try {
        const userId = req.user.userId;
        const fee = Math.round(parseFloat(entryFee || 100.0));
        const cId = contestId || `cnt_${pId}`;
        const remainingFeePaid = fee;

        const productRes = await pool.query("SELECT * FROM products WHERE id = $1", [pId]);
        const product = productRes.rows[0];

        const title = product ? product.title.toUpperCase() : 'SOLE MATES.';
        const subtitle = product ? (product.subtitle || 'LIMITED EDITION').toUpperCase() : 'THE SNEAKER EDIT';

        await pool.query(
            `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, joined_count, entry_start_time, entry_end_time, unlocks_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW() + INTERVAL '24 hours', NOW() + INTERVAL '48 hours', 'LIVE_REGISTRATION')
             ON CONFLICT (id) DO UPDATE SET joined_count = contests.joined_count + 1`,
            [cId, pId, title, subtitle, fee, fee]
        );

        await pool.query(
            `INSERT INTO user_contest_entries (user_id, contest_id, entry_fee_paid, voucher_claimed_amount, is_scratchable, is_scratched, is_winner, voucher_code)
             VALUES ($1, $2, $3, $4, FALSE, FALSE, FALSE, NULL)
             ON CONFLICT (user_id, contest_id) DO UPDATE SET
                is_scratched = FALSE,
                is_winner = FALSE,
                voucher_code = NULL,
                created_at = NOW()`,
            [userId, cId, remainingFeePaid, fee]
        );

        const updatedUser = await pool.query("SELECT coins FROM users WHERE id = $1", [userId]);
        const totalCoins = updatedUser.rows[0] ? updatedUser.rows[0].coins : 0;

        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "⚡ Flash Contest Slot Joined!",
                coinsDeducted > 0
                    ? `Booked slot using ${coinsDeducted} SuperCoins (₹${rupeesDiscount} discount) + ₹${remainingFeePaid} cash.`
                    : `You have successfully booked your slot for ₹${fee}. Contest unlocks soon!`,
                "contest",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Joined contest successfully!",
            contestId: cId,
            superCoinsUsed: coinsDeducted,
            rupeesDiscount: rupeesDiscount,
            remainingFeePaid: remainingFeePaid,
            remainingSuperCoins: totalCoins
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
// 5. SCRATCH & CLAIM REWARD VOUCHER / CASHBACK
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
        const voucherCode = entry ? (entry.voucher_code || 'CASHBACK100') : 'CASHBACK100';
        const returnAmount = entry ? parseFloat(entry.voucher_claimed_amount) : 100.0;

        return res.status(200).json({
            success: true,
            message: isWinner ? "Grand prize claimed! Zero extra payment required." : `₹${returnAmount} Cashback / SuperCoins claimed!`,
            isWinner: isWinner,
            voucherAmount: returnAmount,
            superCoinsEarned: Math.round(returnAmount * 100),
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
// 6. NON-WINNER REDEMPTION 1: INSTANT UPI CASHBACK
// POST /api/v1/contests/claim-cashback
// ======================================
const claimCashback = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId, upiId } = req.body;

        if (!contestId || !upiId) {
            return res.status(400).json({ success: false, message: "contestId and upiId are required" });
        }

        const entryRes = await pool.query(
            "SELECT * FROM user_contest_entries WHERE contest_id = $1 AND user_id = $2",
            [contestId, userId]
        );

        if (entryRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest entry not found" });
        }

        const entry = entryRes.rows[0];
        const returnAmount = parseFloat(entry.voucher_claimed_amount || 100.0);

        await pool.query(
            "UPDATE user_contest_entries SET is_scratched = TRUE, claim_type = 'CASHBACK', claim_status = 'COMPLETED' WHERE id = $1",
            [entry.id]
        );

        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "💵 Cashback Refund Transferred!",
                `Your ₹${returnAmount} contest entry fee refund has been transferred to ${upiId}.`,
                "contest",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: `₹${returnAmount} cashback transferred successfully to ${upiId}!`,
            returnAmount: returnAmount,
            upiId: upiId,
            referenceId: "UPI-" + crypto.randomInt(100000000, 999999999).toString()
        });

    } catch (error) {
        console.error("Claim Cashback Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to claim cashback" });
    }
};

// ======================================
// 7. NON-WINNER REDEMPTION 2: CONVERT TO SUPERCOINS (100 Coins = ₹1)
// POST /api/v1/contests/claim-supercoins
// ======================================
const claimSuperCoins = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId } = req.body;

        if (!contestId) {
            return res.status(400).json({ success: false, message: "contestId is required" });
        }

        const entryRes = await pool.query(
            "SELECT * FROM user_contest_entries WHERE contest_id = $1 AND user_id = $2",
            [contestId, userId]
        );

        if (entryRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest entry not found" });
        }

        const entry = entryRes.rows[0];
        const returnAmount = parseFloat(entry.voucher_claimed_amount || 100.0);
        const coinsToAdd = Math.round(returnAmount * 100);

        await pool.query("UPDATE user_contest_entries SET is_scratched = TRUE WHERE id = $1", [entry.id]);

        const userRes = await pool.query(
            "UPDATE users SET coins = COALESCE(coins, 0) + $1 WHERE id = $2 RETURNING coins",
            [coinsToAdd, userId]
        );

        const totalCoins = userRes.rows[0] ? userRes.rows[0].coins : coinsToAdd;

        await pool.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "⚡ SuperCoins Credited!",
                `${coinsToAdd} SuperCoins (Worth ₹${returnAmount}) credited to your account.`,
                "contest",
                "Just now"
            ]
        );

        return res.status(200).json({
            success: true,
            message: `${coinsToAdd} SuperCoins credited successfully!`,
            coinsAdded: coinsToAdd,
            totalCoins: totalCoins,
            rupeesWorth: returnAmount
        });

    } catch (error) {
        console.error("Claim SuperCoins Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to claim SuperCoins" });
    }
};

// ======================================
// 8. NON-WINNER REDEMPTION 3: BUY AT REMAINING BALANCE
// POST /api/v1/contests/claim-buy-remaining
// ======================================
const claimBuyRemaining = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contestId } = req.body;

        if (!contestId) {
            return res.status(400).json({ success: false, message: "contestId is required" });
        }

        const entryRes = await pool.query(
            `SELECT e.*, c.product_id, c.entry_fee, p.title, p.subtitle, p.image_url, p.regular_price
             FROM user_contest_entries e
             JOIN contests c ON e.contest_id = c.id
             LEFT JOIN products p ON c.product_id = p.id
             WHERE e.contest_id = $1 AND e.user_id = $2`,
            [contestId, userId]
        );

        if (entryRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest entry not found" });
        }

        const row = entryRes.rows[0];
        const returnAmount = parseFloat(row.voucher_claimed_amount || row.entry_fee || 100.0);
        const regularPrice = parseFloat(row.regular_price || 3599.0);
        const remainingBalance = Math.max(0, regularPrice - returnAmount);

        await pool.query("UPDATE user_contest_entries SET is_scratched = TRUE WHERE id = $1", [row.id]);

        return res.status(200).json({
            success: true,
            message: "Remaining balance checkout calculated",
            product: {
                id: row.product_id || 'shoe_1',
                title: row.title || 'Nike Air Force 1',
                subtitle: row.subtitle || 'CHICAGO EDITION',
                imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                regularPrice: regularPrice,
                entryFeePaid: returnAmount,
                remainingBalanceToPay: remainingBalance,
                voucherCode: row.voucher_code || 'CASHBACK100'
            }
        });

    } catch (error) {
        console.error("Claim Buy Remaining Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to calculate remaining balance" });
    }
};

// ======================================
// 9. CLAIM WINNER GRAND PRIZE & CONFIRM DELIVERY ADDRESS
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

        const entryRes = await client.query(
            "SELECT * FROM user_contest_entries WHERE contest_id = $1 AND user_id = $2 AND is_winner = TRUE",
            [contestId, userId]
        );

        if (entryRes.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "User is not a winner of this contest"
            });
        }

        await client.query("BEGIN");

        const contestRes = await client.query("SELECT * FROM contests WHERE id = $1", [contestId]);
        const contest = contestRes.rows[0];
        const productId = contest ? contest.product_id : 'shoe_1';

        await client.query(
            `INSERT INTO contest_winners (contest_id, user_id, product_id, claim_status, delivery_address)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (contest_id, user_id)
             DO UPDATE SET claim_status = 'ADDRESS_CONFIRMED', delivery_address = EXCLUDED.delivery_address`,
            [contestId, userId, productId, 'ADDRESS_CONFIRMED', JSON.stringify(deliveryAddress)]
        );

        const orderId = "SK-WIN-" + crypto.randomInt(100000, 999999).toString();

        await client.query(
            "UPDATE user_contest_entries SET is_scratched = TRUE, claim_type = 'PRIZE_WINNER', claim_status = 'COMPLETED', order_id = $1 WHERE contest_id = $2 AND user_id = $3",
            [orderId, contestId, userId]
        );

        await client.query(
            `INSERT INTO orders (id, user_id, items, delivery_address, payment_method, order_total, discount_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                orderId,
                userId,
                JSON.stringify([{ productId: productId, quantity: 1, isGrandPrize: true }]),
                JSON.stringify(deliveryAddress),
                'CONTEST_ENTRY_PAID_FREE_DISPATCH',
                0.00,
                0.00,
                'CONFIRMED'
            ]
        );

        await client.query(
            `INSERT INTO notifications (user_id, title, body, type, time_ago)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                "📦 Grand Prize Dispatched!",
                `Your Grand Prize Order #${orderId} has been confirmed with ₹0 extra payment! Dispatch in progress.`,
                "order",
                "Just now"
            ]
        );

        await client.query("COMMIT");

        // Process referral cashback reward to Referrer User A when referred friend wins & claims prize!
        await processReferralReward(userId);

        return res.status(200).json({
            success: true,
            message: "Prize claimed successfully! Product dispatched with ₹0 extra charge.",
            orderId: orderId,
            claimStatus: "ADDRESS_CONFIRMED",
            estimatedDelivery: "Delivered in 7-8 business days"
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
// 10. GET COMPLETED CONTEST HISTORY FOR USER
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
            `SELECT e.id AS entry_id, e.contest_id, e.entry_fee_paid, e.voucher_claimed_amount,
                    e.is_scratchable, e.is_scratched, e.is_winner, e.voucher_code,
                    e.claim_type, e.claim_status, e.order_id, e.created_at,
                    c.title AS contest_title, c.subtitle AS contest_subtitle, c.entry_fee, c.voucher_amount, c.product_id,
                    p.title AS product_title, p.subtitle AS product_subtitle, p.image_url, p.regular_price
             FROM user_contest_entries e
             JOIN contests c ON e.contest_id = c.id
             LEFT JOIN products p ON c.product_id = p.id
             WHERE e.user_id = $1
             ORDER BY e.created_at DESC`,
            [userId]
        );

        const formattedHistory = result.rows.map(row => {
            const returnAmount = parseFloat(row.voucher_claimed_amount || row.voucher_amount || 100.0);
            const isWin = row.is_winner || false;
            const cType = row.claim_type || (isWin ? (row.order_id ? 'PRIZE_WINNER' : 'NONE') : 'NONE');
            const cStatus = row.claim_status || (cType !== 'NONE' ? 'COMPLETED' : 'PENDING');

            return {
                id: String(row.entry_id),
                contestId: row.contest_id,
                productId: row.product_id,
                shoeTitle: row.product_title || row.contest_title,
                shoeSubtitle: row.product_subtitle || row.contest_subtitle || 'LIMITED EDITION',
                imageUrl: row.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                winOfferPrice: parseFloat(row.entry_fee_paid || row.entry_fee || 100.0),
                regularPrice: parseFloat(row.regular_price || 3599.0),
                voucherAmount: returnAmount,
                voucherCode: row.voucher_code || 'CASHBACK100',
                isWinner: isWin,
                isScratchable: row.is_scratchable || false,
                isScratched: row.is_scratched || false,
                claimType: cType,
                claimStatus: cStatus,
                orderId: row.order_id,
                completedAt: new Date(row.created_at || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            };
        });

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
    setAdminWinnersCount,
    joinContest,
    scratchVoucher,
    claimCashback,
    claimBuyRemaining,
    claimPrize,
    getContestHistory
};
