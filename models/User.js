const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true 
    },
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true 
    },
    phone: { 
        type: String, 
        required: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    age: { 
        type: Number, 
        required: true 
    },
    about: { 
        type: String, 
        default: "Hey there! I am using Aura Chat." 
    },
    avatar: {
        type: String,
        default: "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg",
    },
    // ✅ Field for Firebase Notification Token
    fcmToken: {
        type: String,
        default: "" 
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);