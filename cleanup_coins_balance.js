const { pool } = require("./config/db");

async function cleanupCoinsBalance() {
  try {
    console.log("=== CLEANING UP DUPLICATE COINS_BALANCE COLUMN IN POSTGRESQL ===");

    // 1. Ensure coins column has the highest value between coins and coins_balance
    await pool.query(`
      UPDATE users
      SET coins = GREATEST(COALESCE(coins, 0), COALESCE(coins_balance, 0));
    `);
    console.log("✅ Synchronized all user coins values!");

    // 2. Drop the redundant duplicate column coins_balance
    await pool.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS coins_balance;
    `);
    console.log("✅ Successfully dropped duplicate column 'coins_balance' from PostgreSQL users table!");

    // 3. Verify final users table schema
    const res = await pool.query("SELECT id, first_name, coins FROM users ORDER BY id ASC");
    console.log("\n📌 Verified PostgreSQL users table with single 'coins' column:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Migration Error:", err.message);
    process.exit(1);
  }
}

cleanupCoinsBalance();
