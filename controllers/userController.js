const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../config/db");

// ======================================
// 1. GET USER PROFILE
// GET /api/v1/user/profile
// ======================================

const getProfile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, phone,
                    referral_code, created_at
             FROM users
             WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile fetched successfully",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Get Profile Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch profile"
        });
    }
};


// ======================================
// 2. UPDATE USER PROFILE
// PUT /api/v1/user/profile
// ======================================

const updateProfile = async (req, res) => {
    try {
        const { fullName, email, phone } = req.body;

        if (!fullName || !fullName.trim()) {
            return res.status(400).json({
                success: false,
                message: "Full name is required"
            });
        }

        const normalizedEmail = email
            ? email.trim().toLowerCase()
            : null;

        const normalizedPhone = phone
            ? phone.trim()
            : null;

        if (!normalizedEmail && !normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number is required"
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET full_name = $1,
                 email = $2,
                 phone = $3,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, full_name, email, phone,
                       referral_code, updated_at`,
            [
                fullName.trim(),
                normalizedEmail,
                normalizedPhone,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Update Profile Error:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Email or phone number is already registered"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to update profile"
        });
    }
};


// ======================================
// 3. REQUEST PASSWORD CHANGE OTP
// POST /api/v1/user/change-password/request-otp
// ======================================

const requestPasswordOtp = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Generate a secure 4-digit OTP
        const otp = crypto.randomInt(1000, 10000).toString();

        // Hash OTP before database storage
        const otpHash = await bcrypt.hash(otp, 10);

        // Invalidate previous unused OTPs
        await pool.query(
            `UPDATE password_change_otps
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL`,
            [userId]
        );

        // Save OTP with 5-minute expiry
        await pool.query(
            `INSERT INTO password_change_otps
             (user_id, otp_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
            [userId, otpHash]
        );

        // LOCAL DEVELOPMENT ONLY:
        // Later replace this with a real email/SMS provider.
        if (process.env.NODE_ENV !== "production") {
            console.log(`SuperKart password OTP for ${userId}: ${otp}`);
        }

        return res.status(200).json({
            success: true,
            message: "OTP generated. Check your registered contact."
        });

    } catch (error) {
        console.error("OTP Request Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to generate OTP"
        });
    }
};


// ======================================
// 4. CHANGE PASSWORD
// PUT /api/v1/user/change-password
// ======================================

const changePassword = async (req, res) => {
    const client = await pool.connect();

    try {
        const { otp, newPassword } = req.body;
        const userId = req.user.userId;

        if (!otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "OTP and new password are required"
            });
        }

        if (!/^\d{4}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: "OTP must contain exactly 4 digits"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "New password must contain at least 8 characters"
            });
        }

        await client.query("BEGIN");

        // Lock user row during password update
        const userResult = await client.query(
            `SELECT password_hash
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Check whether new password is same as old password
        const samePassword = await bcrypt.compare(
            newPassword,
            userResult.rows[0].password_hash
        );

        if (samePassword) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "New password cannot be the same as current password"
            });
        }

        // Get latest unused OTP
        const otpResult = await client.query(
            `SELECT id, otp_hash, expires_at, attempts
             FROM password_change_otps
             WHERE user_id = $1
               AND used_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );

        if (otpResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Please request a new OTP"
            });
        }

        const otpRecord = otpResult.rows[0];

        if (new Date(otpRecord.expires_at) <= new Date()) {
            await client.query(
                `UPDATE password_change_otps
                 SET used_at = NOW()
                 WHERE id = $1`,
                [otpRecord.id]
            );

            await client.query("COMMIT");

            return res.status(400).json({
                success: false,
                message: "OTP expired. Please request a new OTP"
            });
        }

        if (otpRecord.attempts >= 5) {
            await client.query("ROLLBACK");

            return res.status(429).json({
                success: false,
                message: "Too many incorrect OTP attempts. Request a new OTP"
            });
        }

        const isOtpValid = await bcrypt.compare(
            otp,
            otpRecord.otp_hash
        );

        if (!isOtpValid) {
            await client.query(
                `UPDATE password_change_otps
                 SET attempts = attempts + 1
                 WHERE id = $1`,
                [otpRecord.id]
            );

            await client.query("COMMIT");

            return res.status(400).json({
                success: false,
                message: "Incorrect OTP"
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [newPasswordHash, userId]
        );

        // Mark OTP as used
        await client.query(
            `UPDATE password_change_otps
             SET used_at = NOW()
             WHERE id = $1`,
            [otpRecord.id]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Password changed successfully. Please log in again."
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Change Password Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to change password"
        });

    } finally {
        client.release();
    }
};


module.exports = {
    getProfile,
    updateProfile,
    requestPasswordOtp,
    changePassword
};

module.exports = {
    getProfile,
    updateProfile,
    requestPasswordOtp,
    changePassword
};