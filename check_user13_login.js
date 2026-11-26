const bcrypt = require("bcrypt");
const { pool } = require("./config/db");

async function checkUser13Login() {
  try {
    const passwordHash = await bcrypt.hash("Password@123", 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = 13", [passwordHash]);
    console.log("✅ Set User 13 password to 'Password@123' in PostgreSQL!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

checkUser13Login();
