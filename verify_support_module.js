const { pool } = require("./config/db");

async function verifySupportModule() {
  try {
    console.log("=== MODULE 5: REFERRALS, NOTIFICATIONS & HELP SUPPORT DATABASE VERIFICATION ===");

    // 1. Query Notifications Count
    const notifsRes = await pool.query("SELECT COUNT(*) FROM notifications");
    console.log(`\n📌 Total Notifications in PostgreSQL: ${notifsRes.rows[0].count}`);

    // 2. Query Recent Notifications for User 8
    const user8Notifs = await pool.query("SELECT id, user_id, title, body, type, time_ago FROM notifications WHERE user_id = 8 ORDER BY created_at DESC LIMIT 5");
    console.log("\n🔔 Latest Notifications for User 8:");
    console.table(user8Notifs.rows);

    // 3. Query Support Tickets
    const supportRes = await pool.query("SELECT id, user_id, category, custom_query, whatsapp_number, status, created_at FROM support_tickets ORDER BY id DESC LIMIT 5");
    console.log(`\n💬 Support Tickets Logged in PostgreSQL: ${supportRes.rows.length}`);
    console.table(supportRes.rows);

    // 4. Query Referral Conversions
    const refRes = await pool.query("SELECT id, first_name, referral_code, referred_by_id, is_referral_rewarded FROM users WHERE referred_by_id IS NOT NULL");
    console.log(`\n🎁 Referred Users in PostgreSQL: ${refRes.rows.length}`);
    console.table(refRes.rows);

    console.log("\n✅ Database Support, Notifications & Referral Layer Verified!");
    process.exit(0);

  } catch (err) {
    console.error("Database Verification Error:", err.message);
    process.exit(1);
  }
}

verifySupportModule();
