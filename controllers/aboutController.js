const getAboutInfo = async (req, res) => {
    try {
        const host = req.get('host') || '10.215.23.105:5000';
        const protocol = req.protocol || 'http';

        return res.status(200).json({
            success: true,
            appInfo: {
                appName: "SuperKart",
                version: "3.7.0 (Production)",
                tagline: "India's Premier Gamified E-Commerce & Flash Contest Platform",
                logoUrl: `${protocol}://${host}/uploads/app_logo.png`,
                founder: {
                    name: "Sahil Pawar",
                    title: "Founder & Conceptual Architect",
                    vision: "Conceptualized with a vision to eliminate shopping risk and give every user a fair, transparent opportunity to win premium products at nominal deposit fees."
                },
                conceptSummary: "SuperKart is a revolutionary gamified e-commerce platform that combines high-stakes Flash Contest drops with a 0% Loss Guarantee shopping experience.",
                howItWorksSteps: [
                    {
                        step: "1. ⚡ Live Flash Contest Drops",
                        description: "Browse open contest drops and participate by paying a minimal deposit entry fee (e.g. ₹100, ₹149, or ₹299). Participate in as many live contest drops as you desire without limits."
                    },
                    {
                        step: "2. 🎲 Automated Multi-Winner Selection",
                        description: "When a contest window closes, our automated server-side selection algorithm randomly selects official winners from active participants in a 100% transparent and unbiased process."
                    },
                    {
                        step: "3. 🏆 Grand Prize Winner Reward (₹0 Extra Charge)",
                        description: "Official winners receive their selected product with ₹0 additional payment required—their entry deposit covers 100% of the cost with free doorstep delivery and live tracking."
                    },
                    {
                        step: "4. 🛡️ 0% Loss Guarantee for Non-Winners",
                        description: "Non-winning participants lose nothing! Receive 100% of your deposit back as Instant UPI Cashback or buy the product directly at remaining balance."
                    }
                ],
                developers: [
                    {
                        name: "Saurav Gaikwad",
                        role: "Lead Full-Stack Engineer",
                        email: "sggaikwad3@gmail.com"
                    },
                    {
                        name: "Om Dhengle",
                        role: "Lead Mobile Architect",
                        email: "omdhengle162@gmail.com"
                    }
                ]
            }
        });

    } catch (error) {
        console.error("Get About Info Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch app information"
        });
    }
};

module.exports = {
    getAboutInfo
};
