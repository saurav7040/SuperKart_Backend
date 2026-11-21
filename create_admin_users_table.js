const bcrypt = require("bcrypt");
const { pool } = require("./config/db");

async function createAdminTable() {
  try {
    // 1. Create admin_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) DEFAULT 'SUPER_ADMIN',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ admin_users table created in PostgreSQL!");

    // 2. Hash default admin password "admin123"
    const passwordHash = await bcrypt.hash("admin123", 12);

    // 3. Upsert default admin user: admin@superkart.com / admin123
    await pool.query(`
      INSERT INTO admin_users (full_name, email, phone, password_hash, role, is_active)
      VALUES ('SuperKart Admin', 'admin@superkart.com', '9370304733', $1, 'SUPER_ADMIN', TRUE)
      ON CONFLICT (email)
      DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [passwordHash]);

    console.log("✅ Default Admin User seeded: admin@superkart.com / admin123");
    process.exit(0);

  } catch (err) {
    console.error("Error creating admin_users table:", err.message);
    process.exit(1);
  }
}

createAdminTable();
