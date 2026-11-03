const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err);
});

const connectDB = async () => {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("PostgreSQL Connected Successfully!");
        console.log("Database Time:", result.rows[0].now);
    } catch (error) {
        console.error("Database Connection Failed:", error.message);
        throw error;
    }
};

module.exports = { pool, connectDB };