const { pool } = require("../config/db");

// ======================================
// 1. GET ALL PRODUCTS (Filtered by Category)
// GET /api/v1/products?category=shoes|smartphones|all
// ======================================
const getProducts = async (req, res) => {
    try {
        const { category } = req.query;

        let query = "SELECT * FROM products ORDER BY id ASC";
        let params = [];

        if (category && category !== "all") {
            query = "SELECT * FROM products WHERE category = $1 ORDER BY id ASC";
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
            mrpPrice: parseFloat(row.regular_price * 1.5),
            discountPercent: Math.round(((parseFloat(row.regular_price * 1.5) - parseFloat(row.regular_price)) / parseFloat(row.regular_price * 1.5)) * 100),
            rating: parseFloat(row.rating || 4.8),
            totalRatings: parseInt(row.total_ratings || 1000),
            totalReviews: parseInt(row.total_reviews || 200),
            imageUrl: row.image_url,
            imagesList: Array.isArray(row.images_list)
                ? row.images_list
                : (typeof row.images_list === 'string' ? JSON.parse(row.images_list) : [row.image_url, row.image_url, row.image_url]),
            availableHexColors: Array.isArray(row.available_colors)
                ? row.available_colors
                : (typeof row.available_colors === 'string' ? JSON.parse(row.available_colors) : ['#EF4444', '#F59E0B', '#3B82F6', '#111827']),
            availableSizes: row.category === 'smartphones' ? [] : ['IND-6', 'IND-7', 'IND-8', 'IND-9', 'IND-10'],
            availableColors: ['Black', 'Blue', 'White'],
            deliveryEstimate: 'Delivered by Wednesday, 04th Nov',
            brand: 'SuperKart Official',
            highlights: {
                'Brand': row.title,
                'Category': row.category === 'smartphones' ? 'Smartphone 📱' : 'Sneaker 👟',
                'Warranty': '1 Year Brand Warranty',
                'Return Policy': '7 Days Easy Returns'
            },
            reviewsList: [
                {
                    id: 'rev_1',
                    userName: 'Rahul Sharma',
                    rating: 5.0,
                    comment: 'Awesome product! Great quality and super fast delivery.'
                },
                {
                    id: 'rev_2',
                    userName: 'Anjali Verma',
                    rating: 4.5,
                    comment: 'Extremely satisfied with the purchase! Worth every rupee.'
                }
            ]
        }));

        return res.status(200).json({
            success: true,
            message: "Products fetched successfully",
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
            mrpPrice: parseFloat(row.regular_price * 1.5),
            discountPercent: Math.round(((parseFloat(row.regular_price * 1.5) - parseFloat(row.regular_price)) / parseFloat(row.regular_price * 1.5)) * 100),
            rating: parseFloat(row.rating || 4.8),
            totalRatings: parseInt(row.total_ratings || 1000),
            totalReviews: parseInt(row.total_reviews || 200),
            imageUrl: row.image_url,
            imagesList: Array.isArray(row.images_list)
                ? row.images_list
                : (typeof row.images_list === 'string' ? JSON.parse(row.images_list) : [row.image_url, row.image_url, row.image_url]),
            availableHexColors: Array.isArray(row.available_colors)
                ? row.available_colors
                : (typeof row.available_colors === 'string' ? JSON.parse(row.available_colors) : ['#EF4444', '#F59E0B', '#3B82F6', '#111827']),
            availableSizes: row.category === 'smartphones' ? [] : ['IND-6', 'IND-7', 'IND-8', 'IND-9', 'IND-10'],
            availableColors: ['Black', 'Blue', 'White'],
            deliveryEstimate: 'Delivered by Wednesday, 04th Nov',
            brand: 'SuperKart Official',
            highlights: {
                'Brand': row.title,
                'Category': row.category === 'smartphones' ? 'Smartphone 📱' : 'Sneaker 👟',
                'Warranty': '1 Year Brand Warranty',
                'Return Policy': '7 Days Easy Returns'
            },
            reviewsList: [
                {
                    id: 'rev_1',
                    userName: 'Rahul Sharma',
                    rating: 5.0,
                    comment: 'Awesome product! Great quality and super fast delivery.'
                },
                {
                    id: 'rev_2',
                    userName: 'Anjali Verma',
                    rating: 4.5,
                    comment: 'Extremely satisfied with the purchase! Worth every rupee.'
                }
            ]
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
            rating,
            totalRatings,
            totalReviews,
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
            (id, title, subtitle, category, regular_price, win_offer_price, rating, total_ratings, total_reviews, image_url, images_list, available_colors)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                rating || 4.8,
                totalRatings || 1000,
                totalReviews || 200,
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
