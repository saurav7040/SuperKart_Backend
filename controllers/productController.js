const { pool } = require("../config/db");

// ======================================
// 1. GET ALL LIVE CONTEST PRODUCTS (Filtered by OPEN contest window!)
// GET /api/v1/products?category=shoes|smartphones|all
// ======================================
const getProducts = async (req, res) => {
    try {
        const { category } = req.query;

        // SQL Query: ONLY fetch products with an active OPEN contest entry window!
        let query = `
            SELECT p.*, c.id AS contest_id, c.entry_start_time, c.entry_end_time, c.unlocks_at, c.status AS contest_status
            FROM products p
            JOIN contests c ON p.id = c.product_id
            WHERE (c.status IN ('ACTIVE', 'LIVE_REGISTRATION') OR (c.entry_start_time <= NOW() AND c.entry_end_time >= NOW()))
            ORDER BY p.id ASC
        `;

        let params = [];

        if (category && category !== "all") {
            query = `
                SELECT p.*, c.id AS contest_id, c.entry_start_time, c.entry_end_time, c.unlocks_at, c.status AS contest_status
                FROM products p
                JOIN contests c ON p.id = c.product_id
                WHERE p.category = $1
                  AND (c.status IN ('ACTIVE', 'LIVE_REGISTRATION') OR (c.entry_start_time <= NOW() AND c.entry_end_time >= NOW()))
                ORDER BY p.id ASC
            `;
            params = [category];
        }

        const result = await pool.query(query, params);

        const formattedProducts = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            category: row.category || 'shoes',
            regularPrice: parseFloat(row.regular_price),
            winOfferPrice: parseFloat(row.win_offer_price),
            imageUrl: row.image_url,
            imagesList: Array.isArray(row.images_list)
                ? row.images_list
                : (typeof row.images_list === 'string' ? JSON.parse(row.images_list) : [row.image_url, row.image_url, row.image_url]),
            availableHexColors: Array.isArray(row.available_colors)
                ? row.available_colors
                : (typeof row.available_colors === 'string' ? JSON.parse(row.available_colors) : ['#EF4444', '#F59E0B', '#3B82F6', '#111827']),
            availableSizes: row.category === 'smartphones' ? [] : ['IND-6', 'IND-7', 'IND-8', 'IND-9', 'IND-10'],
            availableColors: ['Black', 'Blue', 'White'],
            deliveryEstimate: 'Delivered in 7-8 business days',
            brand: 'SuperKart Official',
            highlights: {
                'Brand': row.title,
                'Category': row.category === 'smartphones' ? 'Smartphone 📱' : 'Sneaker 👟',
                'Warranty': '1 Year Brand Warranty',
                'Return Policy': '7 Days Easy Returns'
            }
        }));

        return res.status(200).json({
            success: true,
            message: "Live contest products fetched successfully",
            products: formattedProducts
        });

    } catch (error) {
        console.error("Get Products Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch products"
        });
    }
};

// ======================================
// 2. GET SINGLE PRODUCT DETAIL BY ID
// GET /api/v1/products/:id
// ======================================
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "SELECT * FROM products WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const row = result.rows[0];
        const formattedProduct = {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            category: row.category || 'shoes',
            regularPrice: parseFloat(row.regular_price),
            winOfferPrice: parseFloat(row.win_offer_price),
            imageUrl: row.image_url,
            imagesList: Array.isArray(row.images_list)
                ? row.images_list
                : (typeof row.images_list === 'string' ? JSON.parse(row.images_list) : [row.image_url, row.image_url, row.image_url]),
            availableHexColors: Array.isArray(row.available_colors)
                ? row.available_colors
                : (typeof row.available_colors === 'string' ? JSON.parse(row.available_colors) : ['#EF4444', '#F59E0B', '#3B82F6', '#111827']),
            availableSizes: row.category === 'smartphones' ? [] : ['IND-6', 'IND-7', 'IND-8', 'IND-9', 'IND-10'],
            availableColors: ['Black', 'Blue', 'White'],
            deliveryEstimate: 'Delivered in 7-8 business days',
            brand: 'SuperKart Official',
            highlights: {
                'Brand': row.title,
                'Category': row.category === 'smartphones' ? 'Smartphone 📱' : 'Sneaker 👟',
                'Warranty': '1 Year Brand Warranty',
                'Return Policy': '7 Days Easy Returns'
            }
        };

        return res.status(200).json({
            success: true,
            message: "Product detail fetched successfully",
            product: formattedProduct
        });

    } catch (error) {
        console.error("Get Product By ID Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch product detail"
        });
    }
};

// ======================================
// 3. CREATE NEW PRODUCT (ADMIN API)
// POST /api/v1/products
// ======================================
const createProduct = async (req, res) => {
    try {
        const {
            id,
            title,
            subtitle,
            category,
            regularPrice,
            winOfferPrice,
            imageUrl,
            imagesList,
            availableHexColors
        } = req.body;

        if (!id || !title || !regularPrice || !winOfferPrice || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: "id, title, regularPrice, winOfferPrice, and imageUrl are required"
            });
        }

        const colorsJson = JSON.stringify(availableHexColors || ["#111827", "#3B82F6"]);
        const imagesJson = JSON.stringify(imagesList || [imageUrl]);

        const result = await pool.query(
            `INSERT INTO products
            (id, title, subtitle, category, regular_price, win_offer_price, image_url, images_list, available_colors)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                subtitle = EXCLUDED.subtitle,
                category = EXCLUDED.category,
                regular_price = EXCLUDED.regular_price,
                win_offer_price = EXCLUDED.win_offer_price,
                image_url = EXCLUDED.image_url,
                images_list = EXCLUDED.images_list
            RETURNING *`,
            [
                id.trim(),
                title.trim(),
                subtitle ? subtitle.trim() : "",
                category || "shoes",
                regularPrice,
                winOfferPrice,
                imageUrl.trim(),
                imagesJson,
                colorsJson
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Product created/updated successfully",
            product: result.rows[0]
        });

    } catch (error) {
        console.error("Create Product Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to create product"
        });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct
};
