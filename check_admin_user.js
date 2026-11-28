const bcrypt = require("bcrypt");
const { pool } = require("./config/db");

async function checkAdminUser() {
  try {
    console.log("=== CHECKING ADMIN USERS TABLE IN POSTGRESQL ===");

    // 1. Ensure admin_users table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'SUPER_ADMIN',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Hash password "admin123"
    const hash = await bcrypt.hash("admin123", 10);

    // 3. Upsert default admin user admin@superkart.com
    await pool.query(`
      INSERT INTO admin_users (full_name, email, password_hash, role, is_active)
      VALUES ('SuperKart Admin', 'admin@superkart.com', $1, 'SUPER_ADMIN', TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE;
    `, [hash]);

    console.log("✅ Created/Updated default admin user in PostgreSQL: admin@superkart.com / admin123!");

    const res = await pool.query("SELECT id, full_name, email, role, is_active FROM admin_users;");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Admin Check Error Details:", err);
    process.exit(1);
  }
}

checkAdminUser();
