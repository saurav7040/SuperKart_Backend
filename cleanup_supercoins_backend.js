const { pool } = require("./config/db");

async function cleanupSuperCoinsBackend() {
  try {
    console.log("=== STEP 1: POSTGRESQL SUPERCOINS DROP & CASHBACK MIGRATION ===");

    // 1. Drop coins column from users table
    await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS coins;");
    console.log("✅ Successfully dropped 'coins' column from PostgreSQL users table!");

    // 2. Ensure cashback_earned column exists in users table
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS cashback_earned NUMERIC(10,2) DEFAULT 0.00;");
    console.log("✅ Ensured 'cashback_earned' column exists in PostgreSQL users table!");

    // 3. Verify users schema
    const res = await pool.query("SELECT id, first_name, referral_code, cashback_earned FROM users ORDER BY id ASC LIMIT 5");
    console.log("\n📌 Verified PostgreSQL users table:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Migration Error:", err.message);
    process.exit(1);
  }
}

cleanupSuperCoinsBackend();
