const { pool } = require("./config/db");

async function resetPixelLiveContest() {
  try {
    console.log("=== RESETTING PIXEL 9 PRO CONTEST TO LIVE_REGISTRATION ===");

    await pool.query(`
      UPDATE contests
      SET status = 'LIVE_REGISTRATION',
          entry_start_time = NOW() - INTERVAL '1 hour',
          entry_end_time = NOW() + INTERVAL '24 hours',
          unlocks_at = NOW() + INTERVAL '48 hours'
      WHERE id LIKE '%phone%' OR product_id LIKE '%phone%';
    `);

    const res = await pool.query("SELECT id, title, entry_start_time, entry_end_time, unlocks_at, status FROM contests;");
    console.log("✅ Contests Status in PostgreSQL:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Reset Error:", err.message);
    process.exit(1);
  }
}

resetPixelLiveContest();
