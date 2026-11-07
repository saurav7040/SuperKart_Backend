const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

// ======================================
// GET ALL HOME BANNERS (Combines PostgreSQL DB + Auto-Syncing Uploads Folder!)
// GET /api/v1/banners
// ======================================
const getBanners = async (req, res) => {
    try {
        const { category } = req.query;
        let dbBanners = [];

        try {
            let query = "SELECT * FROM banners ORDER BY created_at ASC";
            let params = [];

            if (category && category !== "all") {
                query = "SELECT * FROM banners WHERE category = $1 OR category = 'all' ORDER BY created_at ASC";
                params = [category];
            }

            const result = await pool.query(query, params);
            dbBanners = result.rows.map(row => ({
                id: row.id,
                imageUrl: row.image_url,
                campaignTitle: row.campaign_title,
                category: row.category
            }));
        } catch (_) {}

        // Auto-Syncing Uploads Folder Scanner (Reads all client image files in public/uploads/banners/)
        const bannersFolder = path.join(__dirname, "../public/uploads/banners");
        let folderBanners = [];

        if (fs.existsSync(bannersFolder)) {
            const files = fs.readdirSync(bannersFolder);
            const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

            folderBanners = imageFiles.map((file, index) => {
                const host = req.headers.host || "10.187.214.105:5000";
                const protocol = req.protocol || "http";
                return {
                    id: `folder_banner_${index + 1}`,
                    imageUrl: `${protocol}://${host}/uploads/banners/${file}`,
                    campaignTitle: `Flash Contest Campaign ${index + 1}`,
                    category: index % 2 === 0 ? "shoes" : "smartphones"
                };
            });
        }

        // Combine DB Banners & Auto-Scanned Folder Banners (Remove duplicate URLs)
        const combined = [...dbBanners];
        const existingUrls = new Set(dbBanners.map(b => b.imageUrl));

        folderBanners.forEach(b => {
            if (!existingUrls.has(b.imageUrl)) {
                combined.push(b);
            }
        });

        return res.status(200).json({
            success: true,
            message: "Banners fetched successfully",
            banners: combined
        });

    } catch (error) {
        console.error("Get Banners Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch banners"
        });
    }
};

module.exports = {
    getBanners
};
