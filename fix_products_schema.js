const { pool } = require("./config/db");

async function fixProductsSchema() {
  try {
    await pool.query(`
      ALTER TABLE products
      ALTER COLUMN available_colors DROP NOT NULL;
    `);
    console.log("✅ Fixed PostgreSQL products table available_colors constraint!");
    process.exit(0);
  } catch (err) {
    console.error("Error fixing products schema:", err.message);
    process.exit(1);
  }
}

fixProductsSchema();
