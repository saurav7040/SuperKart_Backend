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
        const { fullName, email, phone, password } = req.body;

        // Validate required fields
        if (!fullName || !password || (!email && !phone)) {
            return res.status(400).json({
                success: false,
                message: "Name, password and email or phone are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters"
            });
        }

        const normalizedEmail = email ? email.trim().toLowerCase() : null;
        const normalizedPhone = phone ? phone.trim() : null;

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
                message: "Email or phone number already registered"
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        const referralCode = generateReferralCode();

        // Insert user into PostgreSQL
        const result = await pool.query(
            `INSERT INTO users
            (full_name, email, phone, password_hash, referral_code)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, full_name, email, phone, referral_code, created_at`,
            [
                fullName.trim(),
                normalizedEmail,
                normalizedPhone,
                passwordHash,
                referralCode
            ]
        );

        const user = result.rows[0];

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
            user
        });

    } catch (error) {
        console.error("Register Error:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Email, phone or referral code already exists"
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
        const { emailOrPhone, password } = req.body;

        if (!emailOrPhone || !password) {
            return res.status(400).json({
                success: false,
                message: "Email or phone and password are required"
            });
        }

        const identifier = emailOrPhone.trim();

        // Find user
        const result = await pool.query(
            `SELECT * FROM users
             WHERE email = $1 OR phone = $2`,
            [identifier.toLowerCase(), identifier]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/phone or password"
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
            });
        }

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

        // Generate token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        // Never send password hash to frontend
        const { password_hash, ...safeUser } = user;

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: safeUser
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
            `SELECT id, full_name, email, phone,
                    referral_code, is_active, created_at
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
            message: "User details fetched successfully",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Get User Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch user details"
        });
    }
};

module.exports = {
    register,
    login,
    getMe
};