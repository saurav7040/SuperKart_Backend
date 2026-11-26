const { pool } = require("./config/db");

async function deleteCartProduct() {
  try {
    console.log("=== REMOVING OBSOLETE CART PRODUCT & CONTEST FROM POSTGRESQL ===");

    await pool.query("DELETE FROM user_contest_entries WHERE contest_id IN (SELECT id FROM contests WHERE product_id LIKE '%cart%')");
    await pool.query("DELETE FROM contests WHERE product_id LIKE '%cart%'");
    await pool.query("DELETE FROM products WHERE id LIKE '%cart%' OR LOWER(title) LIKE '%cart%'");

    console.log("✅ Successfully removed obsolete 'Cart' product & contest from PostgreSQL!");

    process.exit(0);

  } catch (err) {
    console.error("Delete Error:", err.message);
    process.exit(1);
  }
}

deleteCartProduct();
