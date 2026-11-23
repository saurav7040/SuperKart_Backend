const { pool } = require("./config/db");

async function addTrackingColumnsToOrders() {
  try {
    console.log("=== ADDING COURIER TRACKING COLUMNS TO ORDERS TABLE ===");

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS awb_tracking_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100) DEFAULT 'Delhivery';
    `);

    console.log("✅ Added 'awb_tracking_number' and 'courier_name' columns to PostgreSQL orders table!");

    // Verify orders schema
    const res = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders';
    `);

    console.log("\n📌 Verified 'orders' table columns:");
    console.table(res.rows);

    process.exit(0);

  } catch (err) {
    console.error("Migration Error:", err.message);
    process.exit(1);
  }
}

addTrackingColumnsToOrders();
