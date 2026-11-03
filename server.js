const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");

const healthRoutes = require("./routes/healthRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

const dbRoutes = require("./routes/dbRoutes");
const authRoutes = require("./routes/authRoutes");


// Middleware
app.use(cors());
app.use(express.json());

// Health API
app.use("/api/v1/db-test", dbRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// Start Server
const startServer = async () => {
    try {
        await connectDB();

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`SuperKart Server running on port ${PORT}`);
            console.log(`API: http://localhost:${PORT}/api/v1/health`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();