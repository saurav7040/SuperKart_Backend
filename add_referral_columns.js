const { pool } = require("./config/db");

async function addReferralColumns() {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referred_by_id INTEGER,
      ADD COLUMN IF NOT EXISTS is_referral_rewarded BOOLEAN DEFAULT FALSE;
    `);
    console.log("✅ Referral columns added to users table!");
    process.exit(0);
  } catch (err) {
    console.error("Error adding referral columns:", err.message);
    process.exit(1);
  }
}

addReferralColumns();
