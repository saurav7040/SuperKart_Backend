const { pool } = require("./config/db");

async function cleanupDuplicateContests() {
  try {
    console.log("=== DEDUPING CONTEST ROWS IN POSTGRESQL ===");

    // Delete duplicate contest entries
    await pool.query("DELETE FROM user_contest_entries WHERE contest_id LIKE '%_374' OR contest_id LIKE '%_476'");
    await pool.query("DELETE FROM contests WHERE id LIKE '%_374' OR id LIKE '%_476'");

    // Update remaining contests to clean IDs
    const res = await pool.query("SELECT id, product_id, title, entry_fee, unlocks_at, status FROM contests ORDER BY id ASC");
    console.log("✅ Remaining Clean Contests in PostgreSQL:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Cleanup Error:", err.message);
    process.exit(1);
  }
}

cleanupDuplicateContests();
