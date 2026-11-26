const { pool } = require("./config/db");

async function getLiveContestIds() {
  const res = await pool.query("SELECT id, product_id, title, status FROM contests;");
  console.log("Live Contests in PostgreSQL:");
  console.table(res.rows);
  process.exit(0);
}

getLiveContestIds();
