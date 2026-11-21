const { pool } = require("./config/db");

async function createSupportTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        custom_query TEXT,
        whatsapp_number VARCHAR(20) NOT NULL,
        status VARCHAR(30) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ support_tickets table created in PostgreSQL!");
    process.exit(0);
  } catch (err) {
    console.error("Error creating support_tickets table:", err.message);
    process.exit(1);
  }
}

createSupportTable();
