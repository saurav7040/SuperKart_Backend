const { pool } = require("./config/db");

async function resetAllContestAndOrdersDb() {
  try {
    console.log("=== COMPLETE DATABASE RESET: ORDERS, CONTEST ENTRIES & WINNERS ===");

    // 1. Truncate orders table
    await pool.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE;");
    console.log("✅ 1. Truncated 'orders' table (0 orders remaining)");

    // 2. Truncate contest_winners table
    await pool.query("TRUNCATE TABLE contest_winners RESTART IDENTITY CASCADE;");
    console.log("✅ 2. Truncated 'contest_winners' table (0 winners remaining)");

    // 3. Truncate user_contest_entries table
    await pool.query("TRUNCATE TABLE user_contest_entries RESTART IDENTITY CASCADE;");
    console.log("✅ 3. Truncated 'user_contest_entries' table (0 joined contest entries remaining)");

    // 4. Reset joined_count to 0 for all contests in contests table
    await pool.query("UPDATE contests SET joined_count = 0;");
    console.log("✅ 4. Reset joined_count = 0 for all active Flash Contests!");

    // 5. Verification
    const ordersRes = await pool.query("SELECT COUNT(*) FROM orders;");
    const entriesRes = await pool.query("SELECT COUNT(*) FROM user_contest_entries;");
    const winnersRes = await pool.query("SELECT COUNT(*) FROM contest_winners;");

    console.log("\n📌 DATABASE STATUS VERIFICATION:");
    console.log(`- Orders Count: ${ordersRes.rows[0].count}`);
    console.log(`- Joined Contest Entries Count: ${entriesRes.rows[0].count}`);
    console.log(`- Contest Winners Count: ${winnersRes.rows[0].count}`);

    console.log("\n🎉 PostgreSQL database is 100% CLEAN and ready for testing from scratch!");
    process.exit(0);

  } catch (err) {
    console.error("Database Reset Error:", err.message);
    process.exit(1);
  }
}

resetAllContestAndOrdersDb();
