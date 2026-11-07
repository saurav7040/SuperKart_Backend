const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../config/db");

// ======================================
// 1. GET USER PROFILE
// GET /api/v1/users/profile
// ======================================

const getProfile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM users WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = result.rows[0];
        const formattedUser = {
            id: String(user.id),
            firstName: user.first_name,
            lastName: user.last_name || '',
            gender: user.gender || 'Male',
            dateOfBirth: user.date_of_birth || '',
            age: user.age || 18,
            addressType: user.address_type || 'Home',
            houseNo: user.house_no || '',
            streetLandmark: user.street_landmark || '',
            pincode: user.pincode || '',
            cityVillage: user.city_village || '',
            state: user.state || '',
            emailOrPhone: user.email || user.phone || '',
            coinsBalance: user.coins_balance ?? 0,
            profilePicUrl: user.profile_pic_url
        };

        return res.status(200).json({
            success: true,
            message: "Profile fetched successfully",
            user: formattedUser
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
// PUT /api/v1/users/profile
// ======================================

const updateProfile = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            gender,
            dateOfBirth,
            age,
            addressType,
            houseNo,
            streetLandmark,
            pincode,
            cityVillage,
            state,
            emailOrPhone,
            profilePicUrl
        } = req.body;

        const effectiveFirstName = firstName || 'User';

        const result = await pool.query(
            `UPDATE users
             SET first_name = $1,
                 last_name = $2,
                 gender = $3,
                 date_of_birth = $4,
                 age = $5,
                 address_type = $6,
                 house_no = $7,
                 street_landmark = $8,
                 pincode = $9,
                 city_village = $10,
                 state = $11,
                 profile_pic_url = $12
             WHERE id = $13
             RETURNING *`,
            [
                effectiveFirstName,
                lastName || '',
                gender || 'Male',
                dateOfBirth || '',
                age || 18,
                addressType || 'Home',
                houseNo || '',
                streetLandmark || '',
                pincode || '',
                cityVillage || '',
                state || '',
                profilePicUrl || null,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = result.rows[0];
        const formattedUser = {
            id: String(user.id),
            firstName: user.first_name,
            lastName: user.last_name || '',
            gender: user.gender || 'Male',
            dateOfBirth: user.date_of_birth || '',
            age: user.age || 18,
            addressType: user.address_type || 'Home',
            houseNo: user.house_no || '',
            streetLandmark: user.street_landmark || '',
            pincode: user.pincode || '',
            cityVillage: user.city_village || '',
            state: user.state || '',
            emailOrPhone: user.email || user.phone || emailOrPhone,
            coinsBalance: user.coins_balance ?? 0,
            profilePicUrl: user.profile_pic_url
        };

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: formattedUser
        });

    } catch (error) {
        console.error("Update Profile Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update profile"
        });
    }
};


// ======================================
// 3. REQUEST PASSWORD CHANGE OTP
// POST /api/v1/users/change-password/request-otp
// ======================================

const requestPasswordOtp = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Generate a secure 4-digit OTP
        const otp = crypto.randomInt(1000, 9999).toString();

        // Invalidate previous unused OTPs
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = (SELECT email FROM users WHERE id = $1)", [userId]);

        // Save OTP with 5-minute expiry
        await pool.query(
            "INSERT INTO user_otps (email_or_phone, otp_code, expires_at) VALUES ((SELECT email FROM users WHERE id = $1), $2, NOW() + INTERVAL '5 minutes')",
            [userId, otp]
        );

        console.log(`🔑 [CHANGE PASSWORD OTP] Generated OTP for user ${userId}: ${otp}`);

        return res.status(200).json({
            success: true,
            message: "OTP generated. Check your registered contact.",
            otp: otp
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
// PUT /api/v1/users/change-password
// ======================================

const changePassword = async (req, res) => {
    try {
        const { otp, newPassword, currentPassword } = req.body;
        const userId = req.user.userId;

        if (!otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "OTP and new password are required"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "New password must contain at least 8 characters"
            });
        }

        // Lock user row during password update
        const userResult = await pool.query(
            "SELECT password_hash FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
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
            return res.status(400).json({
                success: false,
                message: "New password cannot be the same as current password!"
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [newPasswordHash, userId]
        );

        return res.status(200).json({
            success: true,
            message: "Password changed successfully."
        });

    } catch (error) {
        console.error("Change Password Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to change password"
        });
    }
};

// ======================================
// 5. UPDATE MOBILE/EMAIL REQUEST OTP
// POST /api/v1/users/update-contact/send-otp
// ======================================

const updateContactSendOtp = async (req, res) => {
    try {
        const { newEmailOrPhone } = req.body;
        const userId = req.user.userId;

        if (!newEmailOrPhone || !newEmailOrPhone.trim()) {
            return res.status(400).json({
                success: false,
                message: "New mobile number or email is required"
            });
        }

        const identifier = newEmailOrPhone.trim();

        // Check if another user is already registered with this mobile/email
        const existingCheck = await pool.query(
            "SELECT id FROM users WHERE (email = $1 OR phone = $2) AND id != $3",
            [identifier.toLowerCase(), identifier, userId]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Mobile number or email is already registered to another account!"
            });
        }

        // Generate 4-digit OTP
        const otpCode = crypto.randomInt(1000, 9999).toString();

        // Delete unverified OTPs
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        // Save OTP in pgAdmin with 5-minute expiry
        await pool.query(
            "INSERT INTO user_otps (email_or_phone, otp_code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')",
            [identifier, otpCode]
        );

        console.log(`📲 [UPDATE CONTACT OTP] Sent OTP: ${otpCode} to ${identifier}`);

        return res.status(200).json({
            success: true,
            message: `OTP sent to ${identifier}`,
            otp: otpCode,
            newEmailOrPhone: identifier
        });

    } catch (error) {
        console.error("Update Contact Send OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send update contact OTP"
        });
    }
};

// ======================================
// 6. UPDATE MOBILE/EMAIL CONFIRM VERIFICATION
// POST /api/v1/users/update-contact/confirm
// ======================================

const updateContactConfirm = async (req, res) => {
    try {
        const { newEmailOrPhone, otp } = req.body;
        const userId = req.user.userId;

        if (!newEmailOrPhone || !otp) {
            return res.status(400).json({
                success: false,
                message: "New contact and OTP code are required"
            });
        }

        const identifier = newEmailOrPhone.trim();
        const enteredOtp = otp.trim();

        // Verify OTP
        const otpResult = await pool.query(
            "SELECT * FROM user_otps WHERE email_or_phone = $1 AND otp_code = $2 AND expires_at > NOW()",
            [identifier, enteredOtp]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP code!"
            });
        }

        const isEmail = identifier.includes("@");

        // Update email or phone in PostgreSQL
        let updateResult;
        if (isEmail) {
            updateResult = await pool.query(
                "UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [identifier.toLowerCase(), userId]
            );
        } else {
            updateResult = await pool.query(
                "UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [identifier, userId]
            );
        }

        // Clean up OTP
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        const user = updateResult.rows[0];
        const formattedUser = {
            id: String(user.id),
            firstName: user.first_name,
            lastName: user.last_name || '',
            gender: user.gender || 'Male',
            dateOfBirth: user.date_of_birth || '',
            age: user.age || 18,
            addressType: user.address_type || 'Home',
            houseNo: user.house_no || '',
            streetLandmark: user.street_landmark || '',
            pincode: user.pincode || '',
            cityVillage: user.city_village || '',
            state: user.state || '',
            emailOrPhone: user.email || user.phone || identifier,
            coinsBalance: user.coins_balance ?? 0,
            profilePicUrl: user.profile_pic_url
        };

        return res.status(200).json({
            success: true,
            message: "Mobile/Email updated successfully!",
            user: formattedUser
        });

    } catch (error) {
        console.error("Update Contact Confirm Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to verify and update contact"
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    requestPasswordOtp,
    changePassword,
    updateContactSendOtp,
    updateContactConfirm
};
