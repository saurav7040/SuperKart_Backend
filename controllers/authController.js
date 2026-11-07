const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { pool } = require("../config/db");

// Generate unique referral code
const generateReferralCode = () => {
    return "usr_" + crypto.randomInt(1000000000, 10000000000);
};

// =====================================
// 1. USER REGISTRATION API
// POST /api/v1/auth/register
// =====================================

const register = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            fullName,
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
            email,
            phone,
            password
        } = req.body;

        const effectiveFirstName = firstName || (fullName ? fullName.split(' ')[0] : 'User');
        const effectiveLastName = lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
        const identifier = emailOrPhone || email || phone;

        // Validate required fields
        if (!effectiveFirstName || !password || !identifier) {
            return res.status(400).json({
                success: false,
                message: "Name, password, and email or phone are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters"
            });
        }

        const isEmail = identifier.includes("@");
        const normalizedEmail = isEmail ? identifier.trim().toLowerCase() : (email ? email.trim().toLowerCase() : null);
        const normalizedPhone = !isEmail ? identifier.trim() : (phone ? phone.trim() : null);

        // Check duplicate email or phone
        const existingUser = await pool.query(
            `SELECT id FROM users
             WHERE ($1::text IS NOT NULL AND email = $1)
             OR ($2::text IS NOT NULL AND phone = $2)`,
            [normalizedEmail, normalizedPhone]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email or phone number is already registered"
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        const referralCode = generateReferralCode();

        // Insert complete user details into PostgreSQL
        const result = await pool.query(
            `INSERT INTO users
            (first_name, last_name, gender, date_of_birth, age, address_type, house_no, street_landmark, pincode, city_village, state, email, phone, password_hash, referral_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, first_name, last_name, gender, date_of_birth, age, address_type, house_no, street_landmark, pincode, city_village, state, email, phone, referral_code, coins_balance, created_at`,
            [
                effectiveFirstName,
                effectiveLastName,
                gender || 'Male',
                dateOfBirth || '',
                age || 18,
                addressType || 'Home',
                houseNo || '',
                streetLandmark || '',
                pincode || '',
                cityVillage || '',
                state || '',
                normalizedEmail,
                normalizedPhone,
                passwordHash,
                referralCode
            ]
        );

        const user = result.rows[0];

        // Format user object matching Flutter UserModel format
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

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            token,
            user: formattedUser
        });

    } catch (error) {
        console.error("Register Error:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Email or phone number already exists"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
};


// =====================================
// 2. USER LOGIN API
// POST /api/v1/auth/login
// =====================================

const login = async (req, res) => {
    try {
        const { emailOrPhone, username, password } = req.body;
        const identifier = (emailOrPhone || username || '').trim();

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number and password are required"
            });
        }

        // Find user by email or phone
        const result = await pool.query(
            `SELECT * FROM users
             WHERE email = $1 OR phone = $2 OR email = $3 OR phone = $3`,
            [identifier.toLowerCase(), identifier, identifier]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/phone or password"
            });
        }

        const user = result.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/phone or password"
            });
        }

        // Format user object matching Flutter UserModel format
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

        // Generate token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: formattedUser
        });

    } catch (error) {
        console.error("Login Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};

// ======================================
// 3. GET LOGGED-IN USER
// GET /api/v1/auth/me
// ======================================

const getMe = async (req, res) => {
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
            emailOrPhone: user.email || user.phone,
            coinsBalance: user.coins_balance ?? 0,
            profilePicUrl: user.profile_pic_url
        };

        return res.status(200).json({
            success: true,
            message: "User details fetched successfully",
            user: formattedUser
        });

    } catch (error) {
        console.error("Get User Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch user details"
        });
    }
};

// =====================================
// 4. SEND OTP API
// POST /api/v1/auth/send-otp
// =====================================

const sendOtp = async (req, res) => {
    try {
        const { emailOrPhone } = req.body;

        if (!emailOrPhone || !emailOrPhone.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number is required"
            });
        }

        const identifier = emailOrPhone.trim();
        // Generate random 4-digit OTP code
        const otpCode = crypto.randomInt(1000, 9999).toString();

        // Delete any existing unverified OTP for this user
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        // Save OTP with 5-minute expiry
        await pool.query(
            "INSERT INTO user_otps (email_or_phone, otp_code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')",
            [identifier, otpCode]
        );

        console.log(`📲 [SERVER OTP DISPATCH] Sent OTP: ${otpCode} to ${identifier}`);

        return res.status(200).json({
            success: true,
            message: `OTP sent successfully to ${identifier}`,
            otp: otpCode,
            emailOrPhone: identifier
        });

    } catch (error) {
        console.error("Send OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP"
        });
    }
};

// =====================================
// 5. VERIFY OTP API
// POST /api/v1/auth/verify-otp
// =====================================

const verifyOtp = async (req, res) => {
    try {
        const { emailOrPhone, otp } = req.body;

        if (!emailOrPhone || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email or phone and OTP are required"
            });
        }

        const identifier = emailOrPhone.trim();
        const enteredOtp = otp.trim();

        // Check if OTP matches and is not expired
        const result = await pool.query(
            "SELECT * FROM user_otps WHERE email_or_phone = $1 AND otp_code = $2 AND expires_at > NOW()",
            [identifier, enteredOtp]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP code"
            });
        }

        // Clean up verified OTP
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully!"
        });

    } catch (error) {
        console.error("Verify OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "OTP verification failed"
        });
    }
};

// =====================================
// 6. FORGOT PASSWORD REQUEST OTP API
// POST /api/v1/auth/forgot-password/send-otp
// =====================================

const forgotPasswordSendOtp = async (req, res) => {
    try {
        const { emailOrPhone } = req.body;

        if (!emailOrPhone || !emailOrPhone.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number is required"
            });
        }

        const identifier = emailOrPhone.trim();

        // Check if user exists in PostgreSQL users table
        const userResult = await pool.query(
            "SELECT id FROM users WHERE email = $1 OR phone = $2 OR email = $3 OR phone = $3",
            [identifier.toLowerCase(), identifier, identifier]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No account found with this email or mobile number!"
            });
        }

        // Generate random 4-digit OTP code
        const otpCode = crypto.randomInt(1000, 9999).toString();

        // Delete any existing unverified OTP for this user
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        // Save OTP with 5-minute expiry
        await pool.query(
            "INSERT INTO user_otps (email_or_phone, otp_code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')",
            [identifier, otpCode]
        );

        console.log(`🔑 [FORGOT PASSWORD OTP] Sent OTP: ${otpCode} to ${identifier}`);

        return res.status(200).json({
            success: true,
            message: `Password reset OTP sent to ${identifier}`,
            otp: otpCode,
            emailOrPhone: identifier
        });

    } catch (error) {
        console.error("Forgot Password Send OTP Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send password reset OTP"
        });
    }
};

// =====================================
// 7. FORGOT PASSWORD RESET CONFIRM API
// POST /api/v1/auth/forgot-password/reset
// =====================================

const forgotPasswordReset = async (req, res) => {
    try {
        const { emailOrPhone, otp, newPassword } = req.body;

        if (!emailOrPhone || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email/phone, OTP, and new password are required"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters"
            });
        }

        const identifier = emailOrPhone.trim();
        const enteredOtp = otp.trim();

        // Check if OTP matches and is not expired
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

        // Find user
        const userResult = await pool.query(
            "SELECT id, password_hash FROM users WHERE email = $1 OR phone = $2 OR email = $3 OR phone = $3",
            [identifier.toLowerCase(), identifier, identifier]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found!"
            });
        }

        const user = userResult.rows[0];

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: "New password cannot be the same as current password!"
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password in PostgreSQL
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newPasswordHash, user.id]);

        // Clean up verified OTP
        await pool.query("DELETE FROM user_otps WHERE email_or_phone = $1", [identifier]);

        return res.status(200).json({
            success: true,
            message: "Password reset successfully! Please log in with your new password."
        });

    } catch (error) {
        console.error("Forgot Password Reset Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Password reset failed"
        });
    }
};

module.exports = {
    register,
    login,
    getMe,
    sendOtp,
    verifyOtp,
    forgotPasswordSendOtp,
    forgotPasswordReset
};
