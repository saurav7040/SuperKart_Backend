const bcrypt = require("bcrypt");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { pool } = require("../config/db");

// Multer storage engine for profile pictures
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, "../public/uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const userId = req.user ? req.user.userId : 'user';
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `profile_${userId}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

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
            coins: parseInt(user.coins || user.coins_balance || 0),
            coinsBalance: parseInt(user.coins || user.coins_balance || 0),
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
            coins: parseInt(user.coins || user.coins_balance || 0),
            coinsBalance: parseInt(user.coins || user.coins_balance || 0),
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
            message: "Failed to update profile"
        });
    }
};

// ======================================
// 3. UPLOAD PROFILE PICTURE FILE
// POST /api/v1/users/upload-profile-pic
// ======================================
const uploadProfilePic = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided" });
        }

        const userId = req.user.userId;
        const host = req.get('host') || '10.206.145.105:5000';
        const protocol = req.protocol || 'http';
        const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

        await pool.query(
            "UPDATE users SET profile_pic_url = $1 WHERE id = $2",
            [publicUrl, userId]
        );

        return res.status(200).json({
            success: true,
            message: "Profile picture uploaded successfully",
            profilePicUrl: publicUrl
        });

    } catch (error) {
        console.error("Upload Profile Pic Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to upload profile picture" });
    }
};

// ======================================
// 4. REQUEST PASSWORD RESET OTP
// POST /api/v1/users/change-password/request-otp
// ======================================
const requestPasswordOtp = async (req, res) => {
    try {
        const { emailOrPhone } = req.body;
        const identifier = emailOrPhone ? emailOrPhone.trim() : null;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number is required"
            });
        }

        const userRes = await pool.query(
            "SELECT id FROM users WHERE email = $1 OR phone = $1",
            [identifier]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not registered"
            });
        }

        const otp = crypto.randomInt(1000, 9999).toString();

        await pool.query(
            `INSERT INTO user_otps (email_or_phone, otp_code, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
             ON CONFLICT (email_or_phone)
             DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at`,
            [identifier, otp]
        );

        return res.status(200).json({
            success: true,
            message: `OTP sent successfully to ${identifier}`,
            otp: otp
        });

    } catch (error) {
        console.error("Request Password OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP"
        });
    }
};

// ======================================
// 5. CHANGE PASSWORD WITH OTP VERIFICATION
// PUT /api/v1/users/change-password
// ======================================
const changePassword = async (req, res) => {
    try {
        const { emailOrPhone, otp, newPassword } = req.body;

        if (!emailOrPhone || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email/phone, OTP, and new password are required"
            });
        }

        const otpRes = await pool.query(
            "SELECT * FROM user_otps WHERE email_or_phone = $1 AND otp_code = $2 AND expires_at > NOW()",
            [emailOrPhone.trim(), otp.trim()]
        );

        if (otpRes.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE email = $2 OR phone = $2",
            [passwordHash, emailOrPhone.trim()]
        );

        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [emailOrPhone.trim()]);

        return res.status(200).json({
            success: true,
            message: "Password updated successfully!"
        });

    } catch (error) {
        console.error("Change Password Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to change password"
        });
    }
};

// ======================================
// 6. REQUEST CONTACT CHANGE OTP
// POST /api/v1/users/update-contact/send-otp
// ======================================
const updateContactSendOtp = async (req, res) => {
    try {
        const { newEmailOrPhone } = req.body;
        const identifier = newEmailOrPhone ? newEmailOrPhone.trim() : null;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: "New email or phone number is required"
            });
        }

        const otp = crypto.randomInt(1000, 9999).toString();

        await pool.query(
            `INSERT INTO user_otps (email_or_phone, otp_code, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
             ON CONFLICT (email_or_phone)
             DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at`,
            [identifier, otp]
        );

        return res.status(200).json({
            success: true,
            message: `OTP sent successfully to ${identifier}`,
            otp: otp
        });

    } catch (error) {
        console.error("Update Contact Send OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP"
        });
    }
};

// ======================================
// 7. CONFIRM CONTACT CHANGE WITH OTP
// POST /api/v1/users/update-contact/confirm
// ======================================
const updateContactConfirm = async (req, res) => {
    try {
        const { newEmailOrPhone, otp } = req.body;
        const userId = req.user.userId;

        if (!newEmailOrPhone || !otp) {
            return res.status(400).json({
                success: false,
                message: "New contact and OTP are required"
            });
        }

        const identifier = newEmailOrPhone.trim();

        const otpRes = await pool.query(
            "SELECT * FROM user_otps WHERE email_or_phone = $1 AND otp_code = $2 AND expires_at > NOW()",
            [identifier, otp.trim()]
        );

        if (otpRes.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        const isEmail = identifier.includes("@");
        let updateResult;

        if (isEmail) {
            updateResult = await pool.query(
                "UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [identifier, userId]
            );
        } else {
            updateResult = await pool.query(
                "UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
                [identifier, userId]
            );
        }

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
            coins: parseInt(user.coins || user.coins_balance || 0),
            coinsBalance: parseInt(user.coins || user.coins_balance || 0),
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
    uploadProfilePic,
    upload,
    requestPasswordOtp,
    changePassword,
    updateContactSendOtp,
    updateContactConfirm
};
