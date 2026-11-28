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
                contest_id: p.contest_id ? String(p.contest_id) : 'Unlinked Inventory',
                max_winners: parseInt(p.max_winners || 0),
                joined_count: parseInt(p.joined_count || 0),
                contest_status: p.contest_status ? String(p.contest_status) : 'UNLINKED',
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

        const p = result.rows[0];

        return res.status(201).json({
            success: true,
            message: "Product created successfully in PostgreSQL catalog!",
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
// ======================================
// 9. GET PAGINATED CONTEST DROPS LIST
// GET /api/v1/admin/contests
// ======================================
const getAdminContests = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = `
            SELECT c.*, p.title AS product_title, p.subtitle AS product_subtitle, p.image_url, p.regular_price, p.category
            FROM contests c
            LEFT JOIN products p ON c.product_id = p.id
        `;
        let countQuery = "SELECT COUNT(*) FROM contests c LEFT JOIN products p ON c.product_id = p.id";
        let params = [];

        if (search) {
            query += " WHERE LOWER(c.id) LIKE $1 OR LOWER(c.title) LIKE $1 OR LOWER(p.title) LIKE $1";
            countQuery += " WHERE LOWER(c.id) LIKE $1 OR LOWER(c.title) LIKE $1 OR LOWER(p.title) LIKE $1";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY c.entry_start_time DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const formattedContests = result.rows.map(c => {
            const startTime = c.entry_start_time ? new Date(c.entry_start_time).toISOString() : new Date().toISOString();
            const endTime = c.entry_end_time ? new Date(c.entry_end_time).toISOString() : new Date(Date.now() + 172800000).toISOString();
            const unlocksAt = c.unlocks_at ? new Date(c.unlocks_at).toISOString() : new Date(Date.now() + 259200000).toISOString();

            return {
                id: String(c.id),
                productId: c.product_id,
                productTitle: c.product_title || c.title,
                productSubtitle: c.product_subtitle || c.subtitle || 'LIMITED DROP',
                imageUrl: c.image_url || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                category: c.category || 'shoes',
                regularPrice: parseFloat(c.regular_price || 3599),
                entryFee: parseFloat(c.entry_fee || 100),
                joinedCount: parseInt(c.joined_count || 0),
                maxWinners: parseInt(c.max_winners || 5),
                entryStartTime: startTime,
                entryEndTime: endTime,
                unlocksAt: unlocksAt,
                status: c.status || 'LIVE_REGISTRATION'
            };
        });

        return res.status(200).json({
            success: true,
            data: formattedContests,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });

    } catch (error) {
        console.error("Get Admin Contests Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch contest drops" });
    }
};

// ======================================
// 10. CREATE/LAUNCH NEW FLASH CONTEST DROP
// POST /api/v1/admin/contests
// ======================================
const createAdminContest = async (req, res) => {
    try {
        const { productId, entryFee, entryStartTime, entryEndTime, unlocksAt } = req.body;

        if (!productId || !entryFee) {
            return res.status(400).json({ success: false, message: "productId and entryFee are required" });
        }

        const prodRes = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
        if (prodRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Selected product not found in catalog" });
        }

        const prod = prodRes.rows[0];
        const fee = parseFloat(entryFee);

        const startTime = entryStartTime ? new Date(entryStartTime) : new Date();
        const endTime = entryEndTime ? new Date(entryEndTime) : new Date(Date.now() + 48 * 3600 * 1000);
        const resultTime = unlocksAt ? new Date(unlocksAt) : new Date(Date.now() + 72 * 3600 * 1000);

        const existingContest = await pool.query(
            "SELECT id FROM contests WHERE product_id = $1 ORDER BY entry_start_time DESC LIMIT 1",
            [productId]
        );

        let contestId = `cnt_${productId}`;
        let result;

        if (existingContest.rows.length > 0) {
            contestId = existingContest.rows[0].id;
            result = await pool.query(
                `UPDATE contests
                 SET entry_fee = $1, voucher_amount = $1, entry_start_time = $2, entry_end_time = $3, unlocks_at = $4, status = 'LIVE_REGISTRATION'
                 WHERE id = $5
                 RETURNING *`,
                [fee, startTime, endTime, resultTime, contestId]
            );
        } else {
            result = await pool.query(
                `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, max_winners, joined_count, entry_start_time, entry_end_time, unlocks_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 5, 0, $7, $8, $9, 'LIVE_REGISTRATION')
                 RETURNING *`,
                [
                    contestId,
                    productId,
                    prod.title.toUpperCase(),
                    (prod.subtitle || 'LIMITED EDITION').toUpperCase(),
                    fee,
                    fee,
                    startTime,
                    endTime,
                    resultTime
                ]
            );
        }

        const c = result.rows[0];

        return res.status(201).json({
            success: true,
            message: "Flash Contest drop launched successfully!",
            contest: {
                id: c.id,
                productId: c.product_id,
                title: c.title,
                entryFee: parseFloat(c.entry_fee),
                status: c.status
            }
        });

    } catch (error) {
        console.error("Create Admin Contest Error:", error.message);
        return res.status(500).json({ success: false, message: error.message || "Failed to launch contest drop" });
    }
};

// ======================================
// 11. EXTEND CONTEST ENTRY END TIME / RESULT DECLARATION DATE
// PUT /api/v1/admin/contests/:id/extend
// ======================================
const extendAdminContest = async (req, res) => {
    try {
        const contestId = req.params.id;
        const { entryEndTime, unlocksAt, entryFee } = req.body;

        const cRes = await pool.query("SELECT * FROM contests WHERE id = $1", [contestId]);
        if (cRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest drop not found" });
        }

        const current = cRes.rows[0];
        const newEndTime = entryEndTime ? new Date(entryEndTime) : current.entry_end_time;
        const newUnlocksAt = unlocksAt ? new Date(unlocksAt) : current.unlocks_at;
        const newFee = entryFee ? parseFloat(entryFee) : parseFloat(current.entry_fee);

        const isLiveAgain = new Date(newEndTime) > new Date();
        const newStatus = isLiveAgain ? 'LIVE_REGISTRATION' : current.status;

        const result = await pool.query(
            `UPDATE contests
             SET entry_end_time = $1, unlocks_at = $2, entry_fee = $3, voucher_amount = $3, status = $4
             WHERE id = $5
             RETURNING *`,
            [newEndTime, newUnlocksAt, newFee, newStatus, contestId]
        );

        const c = result.rows[0];

        return res.status(200).json({
            success: true,
            message: `Contest drop ${contestId} extended successfully!`,
            contest: {
                id: c.id,
                entryEndTime: c.entry_end_time,
                unlocksAt: c.unlocks_at,
                entryFee: parseFloat(c.entry_fee)
            }
        });

    } catch (error) {
        console.error("Extend Admin Contest Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to extend contest drop" });
    }
};

// ======================================
// 12. DELETE CONTEST DROP
// DELETE /api/v1/admin/contests/:id
// ======================================
const deleteAdminContest = async (req, res) => {
    try {
        const contestId = req.params.id;

        await pool.query("DELETE FROM user_contest_entries WHERE contest_id = $1", [contestId]);
        await pool.query("DELETE FROM contest_winners WHERE contest_id = $1", [contestId]);
        const result = await pool.query("DELETE FROM contests WHERE id = $1 RETURNING *", [contestId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest drop not found" });
        }

        return res.status(200).json({
            success: true,
            message: `Contest drop ${contestId} deleted successfully!`
        });

    } catch (error) {
        console.error("Delete Admin Contest Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to delete contest drop" });
    }
};

// ======================================
// 15. GET CONTEST PARTICIPANTS & WINNERS LIST
// GET /api/v1/admin/contests/:id/participants
// ======================================
const getContestParticipants = async (req, res) => {
    try {
        const contestId = req.params.id;

        const result = await pool.query(
            `SELECT e.id AS entry_id, e.user_id, e.entry_fee_paid, e.is_scratchable, e.is_scratched,
                    e.is_winner, e.claim_type, e.claim_status, e.order_id, e.created_at AS joined_at,
                    u.first_name, u.last_name, u.email, u.phone
             FROM user_contest_entries e
             LEFT JOIN users u ON e.user_id = u.id
             WHERE e.contest_id = $1
             ORDER BY e.created_at ASC`,
            [contestId]
        );

        const participants = result.rows.map(row => {
            const name = `${row.first_name || 'Customer'} ${row.last_name || ''}`.trim();
            const phone = row.phone || 'N/A';
            const email = row.email || 'N/A';

            let outcomeStatus = 'PENDING ⏳';
            if (row.is_scratched || row.claim_status === 'COMPLETED' || row.is_winner) {
                outcomeStatus = row.is_winner ? 'WINNER 🏆' : 'NON-WINNER / LOSER 💵';
            }

            return {
                id: String(row.entry_id),
                userId: String(row.user_id),
                fullName: name,
                phone: phone,
                email: email,
                entryFeePaid: parseFloat(row.entry_fee_paid || 100),
                isWinner: row.is_winner || false,
                isScratched: row.is_scratched || false,
                claimType: row.claim_type || 'NONE',
                claimStatus: row.claim_status || 'PENDING',
                orderId: row.order_id,
                outcomeStatus: outcomeStatus,
                joinedAt: new Date(row.joined_at || new Date()).toLocaleString('en-IN')
            };
        });

        return res.status(200).json({
            success: true,
            contestId: contestId,
            totalJoined: participants.length,
            winnersCount: participants.filter(p => p.isWinner).length,
            losersCount: participants.filter(p => !p.isWinner && (p.isScratched || p.outcomeStatus.includes('LOSER'))).length,
            participants: participants
        });

    } catch (error) {
        console.error("Get Contest Participants Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to fetch contest participants" });
    }
};

// ======================================
// 16. UPDATE CONTEST MAX WINNERS COUNT
// PUT /api/v1/admin/contests/:id/max-winners
// ======================================
const updateContestMaxWinners = async (req, res) => {
    try {
        const contestId = req.params.id;
        const { maxWinners } = req.body;

        if (!maxWinners || parseInt(maxWinners) < 1) {
            return res.status(400).json({ success: false, message: "Valid maxWinners count is required" });
        }

        const numWinners = parseInt(maxWinners);

        const result = await pool.query(
            "UPDATE contests SET max_winners = $1 WHERE id = $2 RETURNING *",
            [numWinners, contestId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest drop not found" });
        }

        return res.status(200).json({
            success: true,
            message: `Max winners count updated to ${numWinners} for contest #${contestId}`,
            contest: result.rows[0]
        });

    } catch (error) {
        console.error("Update Max Winners Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to update max winners count" });
    }
};

// ======================================
// 17. TRIGGER LUCKY DRAW & SELECT MULTI-WINNERS
// POST /api/v1/admin/contests/:id/trigger-draw
// ======================================
const triggerContestDraw = async (req, res) => {
    const client = await pool.connect();

    try {
        const contestId = req.params.id;

        const contestRes = await client.query("SELECT * FROM contests WHERE id = $1", [contestId]);
        if (contestRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contest drop not found" });
        }

        const contest = contestRes.rows[0];
        const maxWinners = parseInt(contest.max_winners || 1);

        // Safeguard: Check if draw is already completed or if participants started scratching cards!
        if (contest.status === 'LOCKED_SCRATCHABLE') {
            const alreadyScratched = await client.query(
                "SELECT id FROM user_contest_entries WHERE contest_id = $1 AND is_scratched = TRUE LIMIT 1",
                [contestId]
            );
            if (alreadyScratched.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Lucky Draw result is already declared and participants have started scratching cards! Re-triggering is locked for compliance."
                });
            }
        }

        const entriesRes = await client.query(
            "SELECT id, user_id FROM user_contest_entries WHERE contest_id = $1",
            [contestId]
        );

        if (entriesRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: "No participants have joined this contest yet!" });
        }

        await client.query("BEGIN");

        const allEntries = entriesRes.rows;

        // Shuffle entries randomly
        const shuffled = [...allEntries].sort(() => 0.5 - Math.random());
        const winnerEntries = shuffled.slice(0, Math.min(maxWinners, shuffled.length));
        const winnerIds = winnerEntries.map(e => e.id);

        // 1. Mark winners
        if (winnerIds.length > 0) {
            await client.query(
                `UPDATE user_contest_entries
                 SET is_winner = TRUE, is_scratchable = TRUE
                 WHERE id = ANY($1::int[])`,
                [winnerIds]
            );
        }

        // 2. Mark remaining participants as non-winners (0% Loss Eligible)
        await client.query(
            `UPDATE user_contest_entries
             SET is_winner = FALSE, is_scratchable = TRUE
             WHERE contest_id = $1 AND NOT (id = ANY($2::int[]))`,
            [contestId, winnerIds.length > 0 ? winnerIds : [-1]]
        );

        // 3. Update contest status to LOCKED_SCRATCHABLE
        await client.query(
            "UPDATE contests SET status = 'LOCKED_SCRATCHABLE', unlocks_at = NOW() WHERE id = $1",
            [contestId]
        );

        // 4. Send Notifications
        for (const entry of winnerEntries) {
            await client.query(
                `INSERT INTO notifications (user_id, title, body, type, time_ago)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    entry.user_id,
                    "🏆 YOU WON THE GRAND PRIZE!",
                    `Congratulations! You won the grand prize for ${contest.title}! Scratch card in My Contest to claim.`,
                    "contest",
                    "Just now"
                ]
            );
        }

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: `Lucky Draw Triggered! Selected ${winnerEntries.length} winners out of ${allEntries.length} participants.`,
            totalParticipants: allEntries.length,
            winnersSelectedCount: winnerEntries.length,
            contestId: contestId
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Trigger Draw Error:", error.message);
        return res.status(500).json({ success: false, message: error.message || "Failed to trigger lucky draw" });
    } finally {
        client.release();
    }
};

// ======================================
// 18. GET PAGINATED REAL ORDERS LIST
// GET /api/v1/admin/orders
// ======================================
const getAdminOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = `
            SELECT o.*, u.first_name, u.last_name, u.email AS user_email, u.phone AS user_phone,
                   u.house_no, u.street_landmark, u.city_village, u.state, u.pincode
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
        `;
        let countQuery = "SELECT COUNT(*) FROM orders o LEFT JOIN users u ON o.user_id = u.id";
        let params = [];

        if (search) {
            query += " WHERE LOWER(o.id) LIKE $1 OR LOWER(o.status) LIKE $1 OR LOWER(u.first_name) LIKE $1 OR u.phone LIKE $1";
            countQuery += " WHERE LOWER(o.id) LIKE $1 OR LOWER(o.status) LIKE $1 OR LOWER(u.first_name) LIKE $1 OR u.phone LIKE $1";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const formattedOrders = result.rows.map(o => {
            let itemsList = [];
            try {
                itemsList = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
            } catch (_) {
                itemsList = [];
            }

            let deliveryAddr = {};
            try {
                deliveryAddr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : (o.delivery_address || {});
            } catch (_) {
                deliveryAddr = {};
            }

            const item = itemsList.length > 0 ? itemsList[0] : {};
            const isGrandPrizeFree = item.isGrandPrize === true || parseFloat(o.order_total || 0) === 0;

            const fullName = deliveryAddr.fullName || `${o.first_name || 'Customer'} ${o.last_name || ''}`.trim();
            const phone = deliveryAddr.phone || o.user_phone || 'N/A';

            const house = deliveryAddr.houseNo || o.house_no || 'Flat 201';
            const street = deliveryAddr.streetLandmark || o.street_landmark || 'Main Road';
            const city = deliveryAddr.cityVillage || o.city_village || 'Georai';
            const stateStr = deliveryAddr.state || o.state || 'Maharashtra';
            const pin = deliveryAddr.pincode || o.pincode || '431127';

            const fullAddress = `${house}, ${street}, ${city}, ${stateStr} - ${pin}`;

            const orderTotalVal = parseFloat(o.order_total || 0);

            const accountOwner = `${o.first_name || 'Customer'} ${o.last_name || ''}`.trim();

            return {
                id: String(o.id),
                orderTotal: isNaN(orderTotalVal) ? 0 : orderTotalVal,
                discountAmount: parseFloat(o.discount_amount || 0),
                paymentMethod: o.payment_method || 'UPI',
                status: (o.status || 'CONFIRMED').toUpperCase(),
                awbTrackingNumber: o.awb_tracking_number || `DEL-${o.id.replace('SK-', '')}`,
                courierName: o.courier_name || 'Delhivery',
                date: new Date(o.created_at || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                isGrandPrizeFree: isGrandPrizeFree,
                accountOwnerName: accountOwner,
                accountOwnerId: String(o.user_id),
                recipientName: fullName,
                recipientPhone: phone,
                customerName: fullName,
                customerPhone: phone,
                productTitle: item.title || 'SuperKart Official Item',
                productSubtitle: item.subtitle || 'LIMITED EDITION',
                imageUrl: item.imageUrl || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                selectedSize: item.selectedSize || 'IND-8',
                quantity: item.quantity || 1,
                deliveryAddress: {
                    fullName: fullName,
                    phone: phone,
                    houseNo: house,
                    streetLandmark: street,
                    cityVillage: city,
                    state: stateStr,
                    pincode: pin,
                    fullAddress: fullAddress
                }
            };
        });

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
// 19. GET PAGINATED REAL REFERRALS LIST
// GET /api/v1/admin/referrals
// ======================================
const getAdminReferrals = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;

        let query = `
            SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.referral_code, u.referred_by_id, u.is_referral_rewarded, u.created_at,
                   ref.first_name AS referrer_first_name, ref.last_name AS referrer_last_name, ref.phone AS referrer_phone, ref.referral_code AS referrer_code
            FROM users u
            LEFT JOIN users ref ON u.referred_by_id = ref.id
            WHERE u.referred_by_id IS NOT NULL
        `;
        let countQuery = "SELECT COUNT(*) FROM users WHERE referred_by_id IS NOT NULL";
        let params = [];

        if (search) {
            query += " AND (LOWER(u.first_name) LIKE $1 OR LOWER(u.referral_code) LIKE $1 OR LOWER(ref.first_name) LIKE $1 OR u.phone LIKE $1)";
            countQuery += " AND (LOWER(first_name) LIKE $1 OR LOWER(referral_code) LIKE $1)";
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count || 0);

        const rewardAmount = parseFloat(process.env.REFERRAL_CASHBACK_REWARD || "200.00");

        const formattedReferrals = result.rows.map(r => {
            const referrer = `${r.referrer_first_name || 'Referrer'} ${r.referrer_last_name || ''}`.trim();
            const referred = `${r.first_name || 'Friend'} ${r.last_name || ''}`.trim();

            return {
                id: String(r.id),
                userId: String(r.id),
                referrerId: String(r.referred_by_id),
                referrerName: referrer,
                referrerPhone: r.referrer_phone || 'N/A',
                referrerCode: r.referrer_code || `REF-${r.referred_by_id}`,
                referredName: referred,
                referredPhone: r.phone || 'N/A',
                rewardAmount: rewardAmount,
                isRewarded: r.is_referral_rewarded || false,
                status: r.is_referral_rewarded ? 'Rewarded (₹200 Paid) ✅' : 'Pending Conversion ⏳',
                date: new Date(r.created_at || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            };
        });

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

// ======================================
// 20. MANUAL REFERRAL REWARD PAYOUT
// POST /api/v1/admin/referrals/payout
// ======================================
const manualPayoutReferral = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

        const userRes = await pool.query(
            "SELECT id, referred_by_id, is_referral_rewarded FROM users WHERE id = $1",
            [userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const user = userRes.rows[0];
        const rewardAmount = parseFloat(process.env.REFERRAL_CASHBACK_REWARD || "200.00");

        if (user.referred_by_id) {
            await pool.query(
                "UPDATE users SET cashback_earned = COALESCE(cashback_earned, 0) + $1 WHERE id = $2",
                [rewardAmount, user.referred_by_id]
            );

            await pool.query(
                `INSERT INTO notifications (user_id, title, body, type, time_ago)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    user.referred_by_id,
                    `🎉 ₹${Math.round(rewardAmount)} Referral Cashback Credited!`,
                    `Your ₹${Math.round(rewardAmount)} referral reward has been credited by SuperKart Admin!`,
                    "reward",
                    "Just now"
                ]
            );
        }

        await pool.query(
            "UPDATE users SET is_referral_rewarded = TRUE WHERE id = $1",
            [userId]
        );

        return res.status(200).json({
            success: true,
            message: `Referral cashback reward of ₹${rewardAmount} credited successfully!`
        });

    } catch (error) {
        console.error("Manual Payout Referral Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to credit referral payout" });
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
    getAdminContests,
    createAdminContest,
    extendAdminContest,
    deleteAdminContest,
    getContestParticipants,
    updateContestMaxWinners,
    triggerContestDraw,
    updateProductStatus,
    getAdminOrders,
    getAdminReferrals,
    manualPayoutReferral
};
