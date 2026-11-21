const { pool } = require("./config/db");

async function dropRatingColumns() {
  try {
    console.log("=== DROPPING OBSOLETE RATING COLUMNS FROM POSTGRESQL PRODUCTS TABLE ===");

    await pool.query(`
      ALTER TABLE products
      DROP COLUMN IF EXISTS rating,
      DROP COLUMN IF EXISTS total_ratings,
      DROP COLUMN IF EXISTS total_reviews;
    `);

    console.log("✅ Successfully dropped 'rating', 'total_ratings', and 'total_reviews' columns!");

    // Verify remaining columns in products table
    const res = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'products';
    `);

    console.log("\n📌 Remaining columns in 'products' table:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Migration Error:", err.message);
    process.exit(1);
  }
}

dropRatingColumns();
