const { pool } = require("./config/db");

async function dropUserCartTable() {
  try {
    console.log("=== REMOVING OBSOLETE USER_CART TABLE FROM POSTGRESQL ===");

    await pool.query("DROP TABLE IF EXISTS user_cart;");
    console.log("✅ Successfully dropped 'user_cart' table from PostgreSQL database!");

    process.exit(0);

  } catch (err) {
    console.error("Migration Error:", err.message);
    process.exit(1);
  }
}

dropUserCartTable();
