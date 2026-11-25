const { pool } = require("./config/db");

async function fixPhoneImageUrl() {
  try {
    console.log("=== UPDATING IPHONE 15 PRO IMAGE URL IN POSTGRESQL ===");

    const validImg = "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9";

    // Update products table
    await pool.query("UPDATE products SET image_url = $1 WHERE id = 'phone_1'", [validImg]);
    console.log("✅ Updated products table image_url for 'phone_1'!");

    // Verify product record
    const res = await pool.query("SELECT id, title, image_url FROM products WHERE id = 'phone_1'");
    console.log("📌 Updated product record:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Update Error:", err.message);
    process.exit(1);
  }
}

fixPhoneImageUrl();
