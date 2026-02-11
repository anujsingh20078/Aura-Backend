const User = require('../models/User');
const cloudinary = require('cloudinary').v2; // Direct import if config file logic is simple
const fs = require('fs');

// ==========================================
// 1. GET USER PROFILE
// ==========================================
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json(user);
    } catch (err) {
        console.error("Error in getMe:", err.message);
        res.status(500).json({ message: "Server Error" });
    }
};

// ==========================================
// 2. UPDATE USER PROFILE
// ==========================================
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, age, about } = req.body;

        const updates = {};
        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (age) updates.age = Number(age);
        if (about) updates.about = about;

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) return res.status(404).json({ message: "User not found" });

        res.status(200).json(updatedUser);

    } catch (err) {
        console.error("Error in updateProfile:", err.message);
        res.status(500).json({ message: "Update failed" });
    }
};

// ==========================================
// 3. SEARCH USERS (Fixed Query Param)
// ==========================================
exports.searchUsers = async (req, res) => {
    try {
        // ✅ FIX: Frontend sends '?search=...', so we use req.query.search
        const search = req.query.search; 

        if (!search) return res.status(200).json([]);

        const users = await User.find({
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } } // Usually email is better for search than username
            ],
            _id: { $ne: req.user._id } 
        })
        .select('name email avatar about') // Return minimal data
        .limit(10);

        res.status(200).json(users);
    } catch (err) {
        console.error("Search Error:", err.message);
        res.status(500).json({ message: "Search failed" });
    }
};

// ==========================================
// 4. UPLOAD AVATAR
// ==========================================
exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No image provided" });

        // Cloudinary Upload
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "aura_avatars",
            width: 300,
            crop: "scale"
        });

        // Cleanup Local File
        try {
            fs.unlinkSync(req.file.path);
        } catch (e) {
            console.log("Error deleting local file", e);
        }

        // ✅ Update 'avatar' field (Ensure your Schema has 'avatar')
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { avatar: result.secure_url },
            { new: true }
        ).select('-password');

        res.status(200).json(user);

    } catch (err) {
        // Error aane par bhi file delete karein
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error("Upload Error:", err);
        res.status(500).json({ message: "Image upload failed" });
    }
};

// ==========================================
// 5. REMOVE AVATAR
// ==========================================
exports.removeAvatar = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { avatar: "" } }, // Remove field
            { new: true }
        ).select('-password');

        res.status(200).json(user);

    } catch (err) {
        console.error("Remove Avatar Error:", err);
        res.status(500).json({ message: "Failed to remove avatar" });
    }
};

// ==========================================
// 6. UPDATE FCM TOKEN (Fixed Destructuring)
// ==========================================
exports.updateFcmToken = async (req, res) => {
    try {
        // ✅ FIX: Frontend sends { fcmToken: '...' }
        const { fcmToken } = req.body; 
        const userId = req.user._id;

        if (!fcmToken) {
            return res.status(400).json({ error: "Token is required" });
        }

        await User.findByIdAndUpdate(userId, { fcmToken: fcmToken });

        res.status(200).json({ message: "FCM Token Updated Successfully" });
    } catch (error) {
        console.error("Error updating FCM token:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};