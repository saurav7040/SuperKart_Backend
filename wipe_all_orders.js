const { pool } = require("./config/db");

async function wipeAllOrders() {
  try {
    console.log("=== WIPING ALL ORDERS FROM POSTGRESQL DATABASE ===");

    // 1. Truncate orders table
    await pool.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE;");
    console.log("✅ Truncated 'orders' table in PostgreSQL!");

    // 2. Reset claim status and order_id in user_contest_entries table
    await pool.query("UPDATE user_contest_entries SET claim_type = 'NONE', claim_status = 'PENDING', order_id = NULL;");
    console.log("✅ Reset redemption claim status in 'user_contest_entries' table!");

    // 3. Verify orders count
    const res = await pool.query("SELECT COUNT(*) FROM orders;");
    console.log(`\n📌 Total Orders remaining in PostgreSQL: ${res.rows[0].count}`);

    process.exit(0);

  } catch (err) {
    console.error("Wipe Error:", err.message);
    process.exit(1);
  }
}

wipeAllOrders();
