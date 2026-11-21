const { pool } = require("./config/db");

async function verifyProductsModule() {
  try {
    console.log("=== MODULE 2: PRODUCT CATALOG & CONTEST DROPS DATABASE VERIFICATION ===");

    // 1. Query Products
    const productsRes = await pool.query("SELECT id, title, subtitle, category, regular_price, win_offer_price FROM products ORDER BY id ASC");
    console.log(`\n📌 Total Products in PostgreSQL: ${productsRes.rows.length}`);
    console.table(productsRes.rows);

    // 2. Query Active Contests
    const contestsRes = await pool.query("SELECT id, product_id, title, entry_fee, voucher_amount, status, entry_start_time, entry_end_time FROM contests ORDER BY id ASC");
    console.log(`\n⚡ Active Contest Drops in PostgreSQL: ${contestsRes.rows.length}`);
    console.table(contestsRes.rows);

    console.log("\n✅ Database Product & Contest Layer Verified!");
    process.exit(0);

  } catch (err) {
    console.error("Database Verification Error:", err.message);
    process.exit(1);
  }
}

verifyProductsModule();
