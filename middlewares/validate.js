const validateSignup = (req, res, next) => {
    const { username, name, email, phone, password, age } = req.body;

    // 1. Check if any field is empty (Strict Check)
    if (!username || !name || !email || !phone || !password || age === undefined || age === null) {
        return res.status(400).json({ message: "All fields are mandatory!" });
    }

    // 2. Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format!" });
    }

    // 3. Age Validation (Convert to number and check NaN)
    const ageNum = parseInt(age);
    if (isNaN(ageNum)) {
        return res.status(400).json({ message: "Age must be a valid number!" });
    }

    if (ageNum < 18) {
        return res.status(400).json({ message: "Age must be 18 or older!" });
    }

    // 4. Password Length (Optional but recommended)
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long!" });
    }

    next(); // Agar sab theek hai toh controller pe jao
};

module.exports = { validateSignup };