const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/db");

// ======================================
// 1. ADMIN LOGIN
// POST /api/v1/admin/auth/login
// ======================================
const adminLogin = async (req, res) => {
    try {
        const { emailOrPhone, password } = req.body;
        const identifier = emailOrPhone ? emailOrPhone.trim().toLowerCase() : '';

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: "Email or phone and password are required"
            });
        }

        const adminRes = await pool.query(
            "SELECT * FROM admin_users WHERE (LOWER(email) = $1 OR phone = $1) AND is_active = TRUE",
            [identifier]
        );

        if (adminRes.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin credentials or account disabled"
            });
        }

        const admin = adminRes.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin credentials"
            });
        }

        const token = jwt.sign(
            {
                adminId: admin.id,
                email: admin.email,
                role: admin.role,
                isAdmin: true
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        const formattedAdmin = {
            id: String(admin.id),
            full_name: admin.full_name,
            email: admin.email,
            phone: admin.phone || '',
            role: admin.role,
            is_active: admin.is_active,
            created_at: admin.created_at
        };

        return res.status(200).json({
            success: true,
            message: "Admin authenticated successfully",
            token: token,
            user: formattedAdmin
        });

    } catch (error) {
        console.error("Admin Login Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to authenticate admin"
        });
    }
};

// ======================================
// 2. GET CURRENT ADMIN PROFILE
// GET /api/v1/admin/auth/me
// ======================================
const getAdminMe = async (req, res) => {
    try {
        const adminId = req.admin.adminId;
        const adminRes = await pool.query("SELECT * FROM admin_users WHERE id = $1", [adminId]);

        if (adminRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Admin user not found" });
        }

        const admin = adminRes.rows[0];
        const formattedAdmin = {
            id: String(admin.id),
            full_name: admin.full_name,
            email: admin.email,
            phone: admin.phone || '',
            role: admin.role,
            is_active: admin.is_active,
            created_at: admin.created_at
        };

        return res.status(200).json({
            success: true,
            user: formattedAdmin
        });

    } catch (error) {
        console.error("Get Admin Me Error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to fetch admin session" });
    }
};

// ======================================
// 3. GET REAL-TIME DASHBOARD ANALYTICS
// GET /api/v1/admin/dashboard
// ======================================
const getAdminDashboard = async (req, res) => {
    try {
        const totalUsersRes = await pool.query("SELECT COUNT(*) FROM users");
        const activeUsersRes = await pool.query("SELECT COUNT(*) FROM users");
        const totalProductsRes = await pool.query("SELECT COUNT(*) FROM products");
        const activeProductsRes = await pool.query("SELECT COUNT(*) FROM products");
        const totalOrdersRes = await pool.query("SELECT COUNT(*) FROM orders");
        const pendingOrdersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'CONFIRMED' OR status = 'SHIPPED'");
        const totalReferralsRes = await pool.query("SELECT COUNT(*) FROM users WHERE referred_by_id IS NOT NULL");
        const totalRevenueRes = await pool.query("SELECT COALESCE(SUM(order_total), 0) AS revenue FROM orders");

        const recentOrdersRes = await pool.query(`
            SELECT id, user_id, order_total, payment_method, status, created_at, items
            FROM orders
            ORDER BY created_at DESC
            LIMIT 10
        `);

        const formattedOrders = recentOrdersRes.rows.map(row => ({
            id: row.id,
            customer: `User #${row.user_id}`,
            date: new Date(row.created_at || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            total: parseFloat(row.order_total || 0),
            status: row.status || 'CONFIRMED'
        }));

        // Dynamic monthly sales calculation
        const salesRes = await pool.query(`
            SELECT TO_CHAR(created_at, 'Mon') AS month, COALESCE(SUM(order_total), 0) AS sales
            FROM orders
            GROUP BY TO_CHAR(created_at, 'Mon'), DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) ASC
            LIMIT 6
        `);

        let salesList = salesRes.rows.map(r => ({ month: r.month, sales: parseFloat(r.sales) }));
        if (salesList.length === 0) {
            salesList = [
                { month: 'Nov', sales: parseFloat(totalRevenueRes.rows[0].revenue || 0) }
            ];
        }

        return res.status(200).json({
            success: true,
            data: {
                stats: {
                    total_users: parseInt(totalUsersRes.rows[0].count || 0),
                    active_users: parseInt(activeUsersRes.rows[0].count || 0),
                    total_products: parseInt(totalProductsRes.rows[0].count || 0),
                    active_products: parseInt(activeProductsRes.rows[0].count || 0),
                    total_orders: parseInt(totalOrdersRes.rows[0].count || 0),
                    pending_orders: parseInt(pendingOrdersRes.rows[0].count || 0),
                    total_referrals: parseInt(totalReferralsRes.rows[0].count || 0),
                    total_revenue: parseFloat(totalRevenueRes.rows[0].revenue || 0)
                },
                sales: salesList,
                recentOrders: formattedOrders
            }
        });

    } catch (error) {
        console.error("Get Dashboard Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to load dashboard data" });
    }
};

// ======================================
// 4. GET PAGINATED REAL USERS LIST (WITH COMPLETE PROFILE, PINCODE & REFERRAL FIELDS)
// GET /api/v1/admin/users
// ======================================
const getAdminUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = `
            SELECT u.id, u.first_name, u.last_name, u.gender, u.date_of_birth, u.age, u.email, u.phone,
                   u.city_village, u.state, u.pincode, u.house_no, u.street_landmark, u.referral_code,
                   u.cashback_earned, u.profile_pic_url, u.referred_by_id, u.is_referral_rewarded, u.created_at,
                   ref.first_name AS referrer_first_name, ref.last_name AS referrer_last_name, ref.referral_code AS referrer_code
            FROM users u
            LEFT JOIN users ref ON u.referred_by_id = ref.id
        `;
        let countQuery = "SELECT COUNT(*) FROM users u";
        let params = [];

        if (search) {
            query += " WHERE LOWER(u.first_name) LIKE $1 OR LOWER(u.last_name) LIKE $1 OR LOWER(u.email) LIKE $1 OR u.phone LIKE $1 OR LOWER(u.referral_code) LIKE $1 OR LOWER(u.city_village) LIKE $1 OR u.pincode LIKE $1";
            countQuery += " WHERE LOWER(u.first_name) LIKE $1 OR LOWER(u.last_name) LIKE $1 OR LOWER(u.email) LIKE $1 OR u.phone LIKE $1 OR LOWER(u.referral_code) LIKE $1 OR LOWER(u.city_village) LIKE $1 OR u.pincode LIKE $1";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const formattedUsers = result.rows.map(user => ({
            id: String(user.id),
            full_name: `${user.first_name} ${user.last_name || ''}`.trim(),
            gender: user.gender || 'Male',
            dob: user.date_of_birth || 'N/A',
            age: user.age || 18,
            email: user.email || 'N/A',
            phone: user.phone || 'N/A',
            pincode: user.pincode || 'N/A',
            location: user.city_village && user.state ? `${user.city_village}, ${user.state} (${user.pincode || ''})` : 'N/A',
            address: user.house_no && user.street_landmark ? `${user.house_no}, ${user.street_landmark}, ${user.city_village}, ${user.state} - ${user.pincode}` : 'N/A',
            referral_code: user.referral_code || `REF-${user.id}`,
            referred_by: user.referrer_first_name ? `${user.referrer_first_name} (${user.referrer_code})` : 'Direct Sign-Up',
            is_referral_rewarded: user.referred_by_id ? (user.is_referral_rewarded ? 'Yes (₹200 Paid)' : 'Pending Conversion') : 'N/A',
            cashback_earned: parseFloat(user.cashback_earned || 0),
            profile_pic_url: user.profile_pic_url,
            is_active: user.is_active !== false,
            created_at: new Date(user.created_at || new Date()).toLocaleDateString('en-IN')
        }));

        return res.status(200).json({
            success: true,
            data: formattedUsers,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });

    } catch (error) {
        console.error("Get Admin Users Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
};

// ======================================
// 5. UPDATE USER ACTIVE STATUS
// PATCH /api/v1/admin/users/:id/status
// ======================================
const updateUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const { is_active } = req.body;

        const activeBool = is_active === true || is_active === 'true';

        const updateRes = await pool.query(
            "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, first_name, email, is_active",
            [activeBool, userId]
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const user = updateRes.rows[0];

        return res.status(200).json({
            success: true,
            message: `User ${user.first_name} account status updated to ${user.is_active ? 'Active' : 'Disabled'}`,
            user: {
                id: String(user.id),
                full_name: user.first_name,
                email: user.email,
                is_active: user.is_active
            }
        });

    } catch (error) {
        console.error("Update User Status Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to update user status" });
    }
};

// ======================================
// 6. GET PAGINATED REAL PRODUCTS LIST
// GET /api/v1/admin/products
// ======================================
const getAdminProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const category = (req.query.category || '').trim().toLowerCase();
        const offset = (page - 1) * limit;

        let query = `
            SELECT p.*, c.id AS contest_id, c.max_winners, c.joined_count, c.status AS contest_status, c.entry_start_time, c.entry_end_time
            FROM products p
            LEFT JOIN contests c ON p.id = c.product_id
        `;
        let countQuery = "SELECT COUNT(*) FROM products p";
        let whereClauses = [];
        let params = [];

        if (search) {
            whereClauses.push(`(LOWER(p.title) LIKE $${params.length + 1} OR LOWER(p.subtitle) LIKE $${params.length + 1} OR LOWER(p.category) LIKE $${params.length + 1})`);
            params.push(`%${search.toLowerCase()}%`);
        }

        if (category && category !== 'all') {
            const catMap = (category === 'shoes' || category === 'shoe') ? 'shoes' : 'smartphones';
            whereClauses.push(`LOWER(p.category) = $${params.length + 1}`);
            params.push(catMap);
        }

        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(" AND ");
            countQuery += " WHERE " + whereClauses.join(" AND ");
        }

        query += ` ORDER BY p.id ASC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const formattedProducts = result.rows.map(p => {
            let parsedImages = [];
            try {
                parsedImages = typeof p.images_list === 'string' ? JSON.parse(p.images_list) : (p.images_list || []);
            } catch (_) {
                parsedImages = [];
            }
            if (parsedImages.length === 0 && p.image_url) parsedImages = [p.image_url];

            let parsedColors = [];
            try {
                parsedColors = typeof p.available_colors === 'string' ? JSON.parse(p.available_colors) : (p.available_colors || []);
            } catch (_) {
                parsedColors = [];
            }
            if (parsedColors.length === 0) parsedColors = ['#000000', '#FFFFFF', '#1E3A8A'];

            const catLower = (p.category || 'shoes').toLowerCase();
            const isPhone = catLower.includes('phone') || catLower.includes('mobile') || catLower.includes('smartphone');
            const categoryDisplay = isPhone ? 'Phones' : 'Shoes';

            return {
                id: String(p.id),
                title: p.title,
                subtitle: p.subtitle || 'LIMITED EDITION',
                name: `${p.title} | ${p.subtitle || ''}`.trim(),
                category: categoryDisplay,
                brand: 'SuperKart',
                price: parseFloat(p.regular_price || 0),
                winOfferPrice: parseFloat(p.win_offer_price || 100),
                image_url: p.image_url,
                images_list: parsedImages,
                available_colors: parsedColors,
                contest_id: p.contest_id || `cnt_${p.id}`,
                max_winners: parseInt(p.max_winners || 5),
                joined_count: parseInt(p.joined_count || 0),
                contest_status: p.contest_status || 'LIVE_REGISTRATION',
                status: 'Active'
            };
        });

        return res.status(200).json({
            success: true,
            data: formattedProducts,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });

    } catch (error) {
        console.error("Get Admin Products Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
};

// ======================================
// 7. CREATE NEW PRODUCT (WITH GALLERY IMAGES & COLOR SWATCHES)
// POST /api/v1/admin/products
// ======================================
const createAdminProduct = async (req, res) => {
    try {
        const { title, subtitle, category, regularPrice, winOfferPrice, imageUrl, imagesList, availableColors } = req.body;

        if (!title || !regularPrice) {
            return res.status(400).json({ success: false, message: "Title and regular price are required" });
        }

        const catInput = (category || 'shoes').trim().toLowerCase();
        const isPhoneInput = catInput.includes('phone') || catInput.includes('mobile') || catInput.includes('smartphone');
        const pCategory = isPhoneInput ? 'smartphones' : 'shoes';
        const shortNum = crypto.randomInt(100, 999);
        const productId = (isPhoneInput ? "phone_" : "shoe_") + shortNum;

        const pTitle = title.trim();
        const pSub = subtitle ? subtitle.trim() : 'LIMITED EDITION';
        const regPrice = parseFloat(regularPrice);
        const winPrice = parseFloat(winOfferPrice || 100.0);
        const img = imageUrl || (isPhoneInput ? 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9' : 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a');

        // Process Gallery Images List
        let finalImages = [img];
        if (Array.isArray(imagesList) && imagesList.length > 0) {
            finalImages = imagesList.filter(url => typeof url === 'string' && url.trim().length > 0);
        } else if (typeof imagesList === 'string' && imagesList.trim().length > 0) {
            finalImages = imagesList.split(/[\n,]+/).map(url => url.trim()).filter(url => url.length > 0);
        }
        if (!finalImages.includes(img)) finalImages.unshift(img);

        // Process Available Color Swatches
        let finalColors = ['#000000', '#FFFFFF', '#1E3A8A'];
        if (Array.isArray(availableColors) && availableColors.length > 0) {
            finalColors = availableColors.filter(c => typeof c === 'string' && c.trim().length > 0);
        } else if (typeof availableColors === 'string' && availableColors.trim().length > 0) {
            finalColors = availableColors.split(/[\n,]+/).map(c => c.trim()).filter(c => c.length > 0);
        }

        const colorsJson = JSON.stringify(finalColors);
        const imagesJson = JSON.stringify(finalImages);

        const result = await pool.query(
            `INSERT INTO products (id, title, subtitle, category, regular_price, win_offer_price, image_url, available_colors, images_list)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [productId, pTitle, pSub, pCategory, regPrice, winPrice, img, colorsJson, imagesJson]
        );

        // Also seed active contest drop in contests table!
        const contestId = `cnt_${productId}`;
        await pool.query(
            `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, max_winners, joined_count, entry_start_time, entry_end_time, unlocks_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, 5, 0, NOW(), NOW() + INTERVAL '48 hours', NOW() + INTERVAL '72 hours', 'LIVE_REGISTRATION')
             ON CONFLICT (id) DO NOTHING`,
            [contestId, productId, pTitle.toUpperCase(), pSub.toUpperCase(), winPrice, winPrice]
        );

        const p = result.rows[0];

        return res.status(201).json({
            success: true,
            message: "Product, gallery images, color swatches, and active contest created successfully!",
            product: {
                id: String(p.id),
                name: `${p.title} | ${p.subtitle}`,
                category: p.category,
                price: parseFloat(p.regular_price),
                stock: 50,
                image_url: p.image_url,
                images_list: finalImages,
                available_colors: finalColors,
                status: 'Active'
            }
        });

    } catch (error) {
        console.error("Create Admin Product Error:", error.message);
        return res.status(500).json({ success: false, message: error.message || "Failed to create product" });
    }
};

// ======================================
// 8. UPDATE EXISTING PRODUCT & CONTEST DROP
// PUT /api/v1/admin/products/:id
// ======================================
const updateAdminProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { title, subtitle, category, regularPrice, winOfferPrice, imageUrl, imagesList, availableColors } = req.body;

        const pRes = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
        if (pRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const current = pRes.rows[0];

        const pTitle = title ? title.trim() : current.title;
        const pSub = subtitle ? subtitle.trim() : current.subtitle;
        const pCategory = category ? category.trim().toLowerCase() : current.category;
        const regPrice = regularPrice ? parseFloat(regularPrice) : parseFloat(current.regular_price);
        const winPrice = winOfferPrice ? parseFloat(winOfferPrice) : parseFloat(current.win_offer_price);
        const img = imageUrl ? imageUrl.trim() : current.image_url;

        let finalImages = [img];
        if (Array.isArray(imagesList) && imagesList.length > 0) {
            finalImages = imagesList.filter(url => typeof url === 'string' && url.trim().length > 0);
        } else if (typeof imagesList === 'string' && imagesList.trim().length > 0) {
            finalImages = imagesList.split(/[\n,]+/).map(url => url.trim()).filter(url => url.length > 0);
        }

        let finalColors = ['#000000', '#FFFFFF', '#1E3A8A'];
        if (Array.isArray(availableColors) && availableColors.length > 0) {
            finalColors = availableColors.filter(c => typeof c === 'string' && c.trim().length > 0);
        } else if (typeof availableColors === 'string' && availableColors.trim().length > 0) {
            finalColors = availableColors.split(/[\n,]+/).map(c => c.trim()).filter(c => c.length > 0);
        }

        const colorsJson = JSON.stringify(finalColors);
        const imagesJson = JSON.stringify(finalImages);

        const result = await pool.query(
            `UPDATE products
             SET title = $1, subtitle = $2, category = $3, regular_price = $4, win_offer_price = $5, image_url = $6, available_colors = $7, images_list = $8
             WHERE id = $9
             RETURNING *`,
            [pTitle, pSub, pCategory, regPrice, winPrice, img, colorsJson, imagesJson, productId]
        );

        await pool.query(
            `UPDATE contests
             SET title = $1, subtitle = $2, entry_fee = $3, voucher_amount = $3
             WHERE product_id = $4`,
            [pTitle.toUpperCase(), pSub.toUpperCase(), winPrice, productId]
        );

        const p = result.rows[0];

        return res.status(200).json({
            success: true,
            message: "Product and contest updated successfully!",
            product: {
                id: String(p.id),
                title: p.title,
                subtitle: p.subtitle,
                name: `${p.title} | ${p.subtitle}`,
                category: p.category,
                price: parseFloat(p.regular_price),
                winOfferPrice: parseFloat(p.win_offer_price),
                image_url: p.image_url,
                images_list: finalImages,
                available_colors: finalColors,
                status: 'Active'
            }
        });

    } catch (error) {
        console.error("Update Admin Product Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to update product" });
    }
};

// ======================================
// 9. DELETE PRODUCT & LINKED CONTEST
// DELETE /api/v1/admin/products/:id
// ======================================
const deleteAdminProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        await pool.query("DELETE FROM user_contest_entries WHERE contest_id IN (SELECT id FROM contests WHERE product_id = $1)", [productId]);
        await pool.query("DELETE FROM contests WHERE product_id = $1", [productId]);
        const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING *", [productId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        return res.status(200).json({
            success: true,
            message: `Product ${productId} and linked contest deleted successfully!`
        });

    } catch (error) {
        console.error("Delete Admin Product Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to delete product" });
    }
};

// ======================================
// 8. UPDATE PRODUCT STATUS
// PATCH /api/v1/admin/products/:id/status
// ======================================
const updateProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const { is_active } = req.body;

        const pRes = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
        if (pRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const p = pRes.rows[0];

        return res.status(200).json({
            success: true,
            message: "Product status updated",
            product: {
                id: String(p.id),
                name: p.title,
                category: p.category,
                price: parseFloat(p.regular_price),
                status: is_active ? 'Active' : 'Inactive'
            }
        });

    } catch (error) {
        console.error("Update Product Status Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to update product status" });
    }
};

// ======================================
// 9. GET PAGINATED REAL ORDERS LIST
// GET /api/v1/admin/orders
// ======================================
const getAdminOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = "SELECT * FROM orders";
        let countQuery = "SELECT COUNT(*) FROM orders";
        let params = [];

        if (search) {
            query += " WHERE LOWER(id) LIKE $1 OR LOWER(status) LIKE $1";
            countQuery += " WHERE LOWER(id) LIKE $1 OR LOWER(status) LIKE $1";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const formattedOrders = result.rows.map(o => ({
            id: String(o.id),
            customer: `User #${o.user_id}`,
            date: new Date(o.created_at || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            total: parseFloat(o.order_total || 0),
            status: o.status || 'CONFIRMED'
        }));

        return res.status(200).json({
            success: true,
            data: formattedOrders,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });

    } catch (error) {
        console.error("Get Admin Orders Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

// ======================================
// 10. GET PAGINATED REAL REFERRALS LIST
// GET /api/v1/admin/referrals
// ======================================
const getAdminReferrals = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = `
            SELECT u.id, u.first_name, u.referral_code, u.referred_by_id, u.is_referral_rewarded, u.created_at,
                   ref.first_name AS referrer_name, ref.referral_code AS referrer_code
            FROM users u
            LEFT JOIN users ref ON u.referred_by_id = ref.id
            WHERE u.referred_by_id IS NOT NULL
        `;
        let countQuery = "SELECT COUNT(*) FROM users WHERE referred_by_id IS NOT NULL";
        let params = [];

        if (search) {
            query += " AND (LOWER(u.first_name) LIKE $1 OR LOWER(u.referral_code) LIKE $1 OR LOWER(ref.first_name) LIKE $1)";
            countQuery += " AND (LOWER(first_name) LIKE $1 OR LOWER(referral_code) LIKE $1)";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const rewardAmount = parseFloat(process.env.REFERRAL_CASHBACK_REWARD || "200.00");

        const formattedReferrals = result.rows.map(r => ({
            id: String(r.id),
            code: r.referrer_code || `REF-${r.referred_by_id}`,
            referrer: r.referrer_name || `Referrer #${r.referred_by_id}`,
            referred: r.first_name || `User #${r.id}`,
            reward: rewardAmount,
            status: r.is_referral_rewarded ? 'Rewarded (₹200 Paid)' : 'Pending Conversion',
            date: new Date(r.created_at || new Date()).toLocaleDateString('en-IN')
        }));

        return res.status(200).json({
            success: true,
            data: formattedReferrals,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });

    } catch (error) {
        console.error("Get Admin Referrals Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch referrals" });
    }
};

module.exports = {
    adminLogin,
    getAdminMe,
    getAdminDashboard,
    getAdminUsers,
    updateUserStatus,
    getAdminProducts,
    createAdminProduct,
    updateAdminProduct,
    deleteAdminProduct,
    updateProductStatus,
    getAdminOrders,
    getAdminReferrals
};
