const { pool } = require("../config/db");
const https = require("https");

// ======================================
// 1. ACCURATE 6-DIGIT INDIAN PINCODE LOOKUP
// GET /api/v1/location/pincode/:pincode
// ======================================
const getPincodeLocation = async (req, res) => {
    try {
        const { pincode } = req.params;

        if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 6-digit Indian pincode"
            });
        }

        // Known Pincode Fast Mapping Dictionary
        const knownPincodes = {
            "431127": { city: "Georai", district: "Beed", state: "Maharashtra" },
            "431143": { city: "Madalmohi", district: "Beed", state: "Maharashtra" },
            "431001": { city: "Aurangabad", district: "Aurangabad", state: "Maharashtra" },
            "411001": { city: "Pune", district: "Pune", state: "Maharashtra" },
            "400001": { city: "Mumbai", district: "Mumbai", state: "Maharashtra" },
            "110001": { city: "New Delhi", district: "Central Delhi", state: "Delhi" },
            "560001": { city: "Bengaluru", district: "Bangalore", state: "Karnataka" },
            "500001": { city: "Hyderabad", district: "Hyderabad", state: "Telangana" },
            "600001": { city: "Chennai", district: "Chennai", state: "Tamil Nadu" },
            "700001": { city: "Kolkata", district: "Kolkata", state: "West Bengal" },
            "380001": { city: "Ahmedabad", district: "Ahmedabad", state: "Gujarat" }
        };

        if (knownPincodes[pincode]) {
            const loc = knownPincodes[pincode];
            return res.status(200).json({
                success: true,
                pincode,
                city: loc.city,
                district: loc.district,
                state: loc.state,
                displayLocation: `${loc.city}, ${loc.state}`
            });
        }

        // Fallback to India Post API with exact Post Office Name (po.Name) priority!
        const apiUrl = `https://api.postalpincode.in/pincode/${pincode}`;

        https.get(apiUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed[0] && parsed[0].Status === 'Success' && parsed[0].PostOffice && parsed[0].PostOffice.length > 0) {
                        const po = parsed[0].PostOffice[0];
                        // Prioritize exact village / post office name (po.Name) over Block/District!
                        const city = (po.Name && po.Name !== 'NA') ? po.Name : ((po.Block && po.Block !== 'NA') ? po.Block : po.District);
                        const state = po.State;
                        const district = po.District;

                        return res.status(200).json({
                            success: true,
                            pincode,
                            city,
                            district,
                            state,
                            displayLocation: `${city}, ${state}`
                        });
                    } else {
                        return res.status(404).json({
                            success: false,
                            message: "Pincode not found"
                        });
                    }
                } catch (_) {
                    return res.status(500).json({ success: false, message: "Pincode lookup error" });
                }
            });
        }).on('error', () => {
            return res.status(500).json({ success: false, message: "Network error fetching pincode" });
        });

    } catch (error) {
        console.error("Pincode Lookup Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to process pincode lookup"
        });
    }
};

// ======================================
// 2. UPDATE USER LOCATION API
// PUT /api/v1/users/location
// ======================================
const updateUserLocation = async (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;
        const { cityVillage, state, pincode, houseNo, streetLandmark, addressType } = req.body;

        if (!cityVillage || !state) {
            return res.status(400).json({
                success: false,
                message: "City and state are required"
            });
        }

        if (userId) {
            await pool.query(
                `UPDATE users
                 SET city_village = $1,
                     state = $2,
                     pincode = COALESCE($3, pincode),
                     house_no = COALESCE($4, house_no),
                     street_landmark = COALESCE($5, street_landmark),
                     address_type = COALESCE($6, address_type),
                     updated_at = NOW()
                 WHERE id = $7`,
                [
                    cityVillage.trim(),
                    state.trim(),
                    pincode ? pincode.trim() : null,
                    houseNo ? houseNo.trim() : null,
                    streetLandmark ? streetLandmark.trim() : null,
                    addressType || 'Home',
                    userId
                ]
            );
        }

        return res.status(200).json({
            success: true,
            message: "Location updated successfully!",
            location: {
                cityVillage: cityVillage.trim(),
                state: state.trim(),
                pincode: pincode || '',
                displayLocationHeader: `${cityVillage.trim()}, ${state.trim()}`
            }
        });

    } catch (error) {
        console.error("Update Location Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to update location"
        });
    }
};

module.exports = {
    getPincodeLocation,
    updateUserLocation
};
