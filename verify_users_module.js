const { pool } = require("./config/db");

async function verifyUsersModule() {
  try {
    console.log("=== MODULE 1: USER MANAGEMENT DATABASE VERIFICATION ===");

    // 1. Check Registered Users
    const usersRes = await pool.query("SELECT id, first_name, email, phone, referral_code, coins, created_at FROM users ORDER BY id ASC");
    console.log(`\n📌 Total Registered Mobile Users in PostgreSQL: ${usersRes.rows.length}`);
    console.table(usersRes.rows);

    // 2. Check Admin Users
    const adminRes = await pool.query("SELECT id, full_name, email, role, is_active, created_at FROM admin_users");
    console.log(`\n🔑 Admin Users in PostgreSQL: ${adminRes.rows.length}`);
    console.table(adminRes.rows);

    console.log("\n✅ Database User Management Layer Verified!");
    process.exit(0);

  } catch (err) {
    console.error("Database Verification Error:", err.message);
    process.exit(1);
  }
}

verifyUsersModule();
