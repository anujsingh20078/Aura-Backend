const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// SIGNUP LOGIC
exports.signup = async (req, res) => {
    try {
        const { username, name, email, phone, password, age } = req.body;

        // 1. Double check for existing user (Safety Layer)
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ 
                message: "Username or Email already registered!" 
            });
        }

        // 2. Password Hashing
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create New User Instance
        // Tip: Ensure age is passed as a Number
        const newUser = new User({
            username,
            name,
            email,
            phone,
            password: hashedPassword,
            age: Number(age) 
        });

        // 4. Save to Database
        await newUser.save();
        
        // Success Response
        return res.status(201).json({ 
            message: "User registered successfully! Ab login karein." 
        });

    } catch (err) {
        // Console log lagayein taaki terminal mein error dikhe
        console.error("🔥 SIGNUP ERROR:", err);

        // Duplicate Key Error (MongoDB code 11000)
        if (err.code === 11000) {
            return res.status(400).json({ 
                message: "Username ya Email pehle se exist karta hai!" 
            });
        }

        // Mongoose Validation Error (e.g., missing required fields)
        if (err.name === 'ValidationError') {
            return res.status(400).json({ 
                message: "Validation failed: " + err.message 
            });
        }

        // Generic Server Error
        return res.status(500).json({ 
            message: "Server internal error, try again later.",
            error: err.message // Sirf development mein error message bhejein
        });
    }
};

// Get Logged In User Data
exports.getUserProfile = async (req, res) => {
    try {
        // req.userId humein verifyToken middleware se mil jayega
        const user = await User.findById(req.userId).select('-password'); 
        
        if (!user) {
            return res.status(404).json({ message: "User nahi mila!" });
        }

        res.status(200).json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
};

// LOGIN LOGIC (Pehle se sahi hai, bas consistency ke liye returns add kiye hain)
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid Email or Password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Email or Password" });
        }

        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' }
        );

        return res.status(200).json({
            token,
            message: "Login successful!",
            user: { 
                username: user.username, 
                name: user.name,
                email: user.email,
                phone: user.phone,
                age: user.age
            }
        });

    } catch (err) {
        console.error("🔥 LOGIN ERROR:", err);
        return res.status(500).json({ message: "Server error" });
    }
};