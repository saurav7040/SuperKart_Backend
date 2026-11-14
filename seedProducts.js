const { pool } = require("./config/db");

const seedProducts = async () => {
    try {
        console.log("Seeding products & contest drops into PostgreSQL database...");

        const products = [
            // 1-COLUMN SHOES CATEGORY
            {
                id: 'shoe_1',
                title: 'Nike Air Force',
                subtitle: '1 low',
                category: 'shoes',
                regular_price: 3599.0,
                win_offer_price: 100.0,
                rating: 4.4,
                total_ratings: 11501,
                total_reviews: 828,
                image_url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                    'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2',
                    'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519',
                    'https://images.unsplash.com/photo-1542291026-7eec264c27ff'
                ]),
                available_colors: JSON.stringify(['#EF4444', '#F59E0B', '#3B82F6', '#111827'])
            },
            {
                id: 'shoe_2',
                title: 'Nike Air Jordan',
                subtitle: 'Pixel Edition',
                category: 'shoes',
                regular_price: 4299.0,
                win_offer_price: 149.0,
                rating: 4.6,
                total_ratings: 12551,
                total_reviews: 940,
                image_url: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2',
                    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
                    'https://images.unsplash.com/photo-1542291026-7eec264c27ff'
                ]),
                available_colors: JSON.stringify(['#F97316', '#38BDF8', '#78350F', '#111827'])
            },
            {
                id: 'shoe_3',
                title: 'Adidas Ultraboost',
                subtitle: '22 Light',
                category: 'shoes',
                regular_price: 4899.0,
                win_offer_price: 199.0,
                rating: 4.7,
                total_ratings: 8420,
                total_reviews: 610,
                image_url: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519',
                    'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2',
                    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a'
                ]),
                available_colors: JSON.stringify(['#10B981', '#111827', '#6366F1'])
            },

            // 2-COLUMN SMARTPHONES CATEGORY
            {
                id: 'phone_1',
                title: 'iPhone 15 Pro',
                subtitle: 'Titanium 256GB',
                category: 'smartphones',
                regular_price: 134900.0,
                win_offer_price: 299.0,
                rating: 4.9,
                total_ratings: 28420,
                total_reviews: 3200,
                image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9',
                    'https://images.unsplash.com/photo-1565849904461-04a58ad377e0',
                    'https://images.unsplash.com/photo-1598327105666-5b89351aff97'
                ]),
                available_colors: JSON.stringify(['#3B82F6', '#111827', '#E5E7EB'])
            },
            {
                id: 'phone_2',
                title: 'Samsung S24 Ultra',
                subtitle: '5G Titanium',
                category: 'smartphones',
                regular_price: 129999.0,
                win_offer_price: 249.0,
                rating: 4.8,
                total_ratings: 19500,
                total_reviews: 2100,
                image_url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf',
                    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9'
                ]),
                available_colors: JSON.stringify(['#111827', '#6B7280', '#EAB308'])
            },
            {
                id: 'phone_3',
                title: 'OnePlus 12',
                subtitle: 'Silky Black 16GB',
                category: 'smartphones',
                regular_price: 64999.0,
                win_offer_price: 199.0,
                rating: 4.7,
                total_ratings: 14200,
                total_reviews: 1400,
                image_url: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1565849904461-04a58ad377e0',
                    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9'
                ]),
                available_colors: JSON.stringify(['#111827', '#10B981'])
            },
            {
                id: 'phone_4',
                title: 'Nothing Phone (2)',
                subtitle: 'Glyph White 256GB',
                category: 'smartphones',
                regular_price: 39999.0,
                win_offer_price: 149.0,
                rating: 4.6,
                total_ratings: 9800,
                total_reviews: 890,
                image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97',
                images_list: JSON.stringify([
                    'https://images.unsplash.com/photo-1598327105666-5b89351aff97',
                    'https://images.unsplash.com/photo-1565849904461-04a58ad377e0'
                ]),
                available_colors: JSON.stringify(['#FFFFFF', '#111827'])
            }
        ];

        for (const item of products) {
            await pool.query(
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
                    images_list = EXCLUDED.images_list`,
                [
                    item.id,
                    item.title,
                    item.subtitle,
                    item.category,
                    item.regular_price,
                    item.win_offer_price,
                    item.rating,
                    item.total_ratings,
                    item.total_reviews,
                    item.image_url,
                    item.images_list,
                    item.available_colors
                ]
            );

            // Auto-seed active contest drops for all products in contests table!
            const contestId = `cnt_${item.id}`;
            const fee = item.win_offer_price;
            await pool.query(
                `INSERT INTO contests (id, product_id, title, subtitle, entry_fee, voucher_amount, joined_count, unlocks_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '2 hours 14 minutes', 'ACTIVE')
                 ON CONFLICT (id) DO UPDATE SET
                    entry_fee = EXCLUDED.entry_fee,
                    voucher_amount = EXCLUDED.voucher_amount`,
                [
                    contestId,
                    item.id,
                    item.title.toUpperCase(),
                    (item.subtitle || 'LIMITED DROP').toUpperCase(),
                    fee,
                    fee * 2,
                    1
                ]
            );
        }

        console.log("Products & contest drops seeded successfully into PostgreSQL! 🎉");
        process.exit(0);

    } catch (error) {
        console.error("Product Seeding Failed:", error.message);
        process.exit(1);
    }
};

seedProducts();
