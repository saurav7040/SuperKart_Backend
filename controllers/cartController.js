const { pool } = require("../config/db");

// ======================================
// 1. GET USER CART ITEMS & ORDER SUMMARY
// GET /api/v1/cart
// ======================================
const getCart = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT c.id AS cart_id, c.product_id, c.selected_size, c.quantity,
                    p.title, p.subtitle, p.category, p.regular_price, p.win_offer_price,
                    p.rating, p.image_url
             FROM user_cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = $1
             ORDER BY c.created_at DESC`,
            [userId]
        );

        let orderTotal = 0;
        let mrpTotal = 0;

        const formattedItems = result.rows.map(row => {
            const price = parseFloat(row.regular_price);
            const mrp = parseFloat(row.regular_price * 1.5);
            const qty = parseInt(row.quantity);

            orderTotal += price * qty;
            mrpTotal += mrp * qty;

            return {
                id: String(row.cart_id),
                productId: row.product_id,
                title: `${row.title} | ${row.subtitle}`,
                imageUrl: row.image_url,
                regularPrice: price,
                mrpPrice: mrp,
                discountPercent: Math.round(((mrp - price) / mrp) * 100),
                selectedSize: row.selected_size || 'Standard',
                quantity: qty,
                estimatedDelivery: 'Delivered by Wednesday, 04th Nov'
            };
        });

        const discountTotal = mrpTotal - orderTotal;

        return res.status(200).json({
            success: true,
            message: "Cart items fetched successfully",
            cartItems: formattedItems,
            summary: {
                totalItems: formattedItems.length,
                mrpTotal: Math.round(mrpTotal),
                discountTotal: Math.round(discountTotal),
                orderTotal: Math.round(orderTotal)
            }
        });

    } catch (error) {
        console.error("Get Cart Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch cart items"
        });
    }
};

// ======================================
// 2. ADD ITEM TO CART (UPSERT INCREMENT)
// POST /api/v1/cart/add
// ======================================
const addToCart = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { productId, selectedSize, quantity } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "productId is required"
            });
        }

        const size = selectedSize || 'Standard';
        const qty = parseInt(quantity || 1);

        // Verify product exists in PostgreSQL
        const productCheck = await pool.query("SELECT id FROM products WHERE id = $1", [productId]);
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Upsert into user_cart (Increment quantity if product+size exists for user)
        const result = await pool.query(
            `INSERT INTO user_cart (user_id, product_id, selected_size, quantity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, product_id, selected_size)
             DO UPDATE SET quantity = user_cart.quantity + EXCLUDED.quantity, updated_at = NOW()
             RETURNING *`,
            [userId, productId, size, qty]
        );

        return res.status(201).json({
            success: true,
            message: "Added to cart successfully!",
            cartItem: result.rows[0]
        });

    } catch (error) {
        console.error("Add to Cart Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to add item to cart"
        });
    }
};

// ======================================
// 3. UPDATE ITEM QUANTITY IN CART
// PUT /api/v1/cart/:id
// ======================================
const updateCartQuantity = async (req, res) => {
    try {
        const userId = req.user.userId;
        const cartId = req.params.id;
        const { quantity } = req.body;

        const newQty = parseInt(quantity);
        if (isNaN(newQty) || newQty < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1"
            });
        }

        const result = await pool.query(
            `UPDATE user_cart
             SET quantity = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [newQty, cartId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Cart quantity updated successfully",
            cartItem: result.rows[0]
        });

    } catch (error) {
        console.error("Update Cart Quantity Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to update cart quantity"
        });
    }
};

// ======================================
// 4. REMOVE ITEM FROM CART
// DELETE /api/v1/cart/:id
// ======================================
const removeFromCart = async (req, res) => {
    try {
        const userId = req.user.userId;
        const cartId = req.params.id;

        const result = await pool.query(
            "DELETE FROM user_cart WHERE id = $1 AND user_id = $2 RETURNING *",
            [cartId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Item removed from cart"
        });

    } catch (error) {
        console.error("Remove From Cart Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to remove item from cart"
        });
    }
};

// ======================================
// 5. CLEAR ENTIRE CART FOR USER
// DELETE /api/v1/cart
// ======================================
const clearCart = async (req, res) => {
    try {
        const userId = req.user.userId;

        await pool.query("DELETE FROM user_cart WHERE user_id = $1", [userId]);

        return res.status(200).json({
            success: true,
            message: "Cart cleared successfully"
        });

    } catch (error) {
        console.error("Clear Cart Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to clear cart"
        });
    }
};

// ======================================
// 6. GET RANDOM EMPTY CART ILLUSTRATION
// GET /api/v1/cart/empty-illustration
// ======================================
const getEmptyCartIllustration = async (req, res) => {
    try {
        const { gender } = req.query;

        // 5 High-Quality Random Shopping Illustration Images
        const femaleIllustrations = [
            'https://images.unsplash.com/photo-1543163521-1bf539c55dd2',
            'https://images.unsplash.com/photo-1483985988355-763728e1935b',
            'https://images.unsplash.com/photo-1490481651871-ab68de25d43d',
            'https://images.unsplash.com/photo-1445205170230-053b83016050',
            'https://images.unsplash.com/photo-1472851294608-062f824d29cc'
        ];

        const maleIllustrations = [
            'https://images.unsplash.com/photo-1483985988355-763728e1935b',
            'https://images.unsplash.com/photo-1490578474895-699bc4e2cf59',
            'https://images.unsplash.com/photo-1507679799987-c73779587ccf',
            'https://images.unsplash.com/photo-1516826957135-700dedea698c',
            'https://images.unsplash.com/photo-1441986300917-64674bd600d8'
        ];

        const list = (gender && gender.toLowerCase() === 'female') ? femaleIllustrations : maleIllustrations;

        // Pick a random illustration from the list on every API call!
        const randomIndex = Math.floor(Math.random() * list.length);
        const randomImageUrl = list[randomIndex];

        return res.status(200).json({
            success: true,
            message: "Empty cart illustration fetched successfully",
            illustrationUrl: randomImageUrl,
            randomIndex: randomIndex
        });

    } catch (error) {
        console.error("Get Empty Cart Illustration Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch empty cart illustration"
        });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    getEmptyCartIllustration
};
