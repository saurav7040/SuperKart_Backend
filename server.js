const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { connectDB } = require("./config/db");

const healthRoutes = require("./routes/healthRoutes");
const userRoutes = require("./routes/userRoutes");
const dbRoutes = require("./routes/dbRoutes");
const authRoutes = require("./routes/authRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const productRoutes = require("./routes/productRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const locationRoutes = require("./routes/locationRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static upload image files publicly!
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// API Routes
app.use("/api/v1/db-test", dbRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/banners", bannerRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/location", locationRoutes);

// Start Server
const startServer = async () => {
    try {
        await connectDB();

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`SuperKart Server running on port ${PORT}`);
            console.log(`API: http://localhost:${PORT}/api/v1/health`);
            console.log(`Uploads: http://localhost:${PORT}/uploads/`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
