const { pool } = require("./config/db");

async function addIsActiveColumn() {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);
    console.log("✅ Added 'is_active' column to PostgreSQL users table!");
    process.exit(0);
  } catch (err) {
    console.error("Error adding is_active column:", err.message);
    process.exit(1);
  }
}

addIsActiveColumn();
