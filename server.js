require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer'); 
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const admin = require("firebase-admin");
const { Server } = require("socket.io"); 
const http = require("http");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const crypto = require("crypto"); 

// Models & Routes
const User = require("./models/User"); 
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require('./routes/userRoutes');

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

// ================= 1. MIDDLEWARES (CORS Fix) =================
app.use(express.json());

// Railway aur Vercel/Localhost sabke liye Flexible CORS
app.use(cors({
    origin: true, // Auto-allow requesting origin (Frontend)
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ================= 2. DB CONNECTION (Stability Fix) =================
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // 5s se zyada wait na kare
})
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.log("❌ DB Connection Error:", err.message));

// ================= 3. EMAIL SETUP (Gmail SMTP + IPv4 Fix) =================
let otpStore = {}; 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.googlemail.com',
    port: 465,
    secure: true,
    auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    },
    family: 4 // 🔥 VVIP: Ye Railway par connection timeout rokta hai
});

// Verification Log
transporter.verify((error, success) => {
    if (error) {
        console.log("❌ Email Service Error:", error.message);
    } else {
        console.log("✅ Gmail SMTP Ready (IPv4 Mode)");
    }
});

// Helper Function: Send OTP
const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: `"Aura App" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Verify your Aura Account',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #6d28d9;">Aura Verification</h2>
                <p>Your OTP for account verification is:</p>
                <h1 style="background: #f3f4f6; padding: 10px; display: inline-block; letter-spacing: 5px; color: #333;">${otp}</h1>
                <p>This code expires in 5 minutes.</p>
            </div>
        `
    };
    return transporter.sendMail(mailOptions);
};

// ================= 4. AUTH ROUTES =================

// Send OTP Route
app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    console.log(`📩 OTP Request for: ${email}`);

    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ message: "Database not connected yet" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User exists. Please Login." });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        otpStore[email] = otp;
        setTimeout(() => { delete otpStore[email] }, 5 * 60 * 1000);

        await sendOTPEmail(email, otp);
        
        console.log(`✅ OTP Sent to ${email}`);
        res.status(200).json({ message: "OTP sent successfully" });

    } catch (error) {
        console.error("🔥 Email Error:", error.message);
        res.status(500).json({ 
            message: "Failed to send OTP", 
            error: error.message 
        });
    }
});

// Verify Signup Route
app.post('/verify-signup', async (req, res) => {
    try {
        const { username, name, email, password, age, phone, otp } = req.body;
        
        if (!otpStore[email] || otpStore[email] !== otp) {
            return res.status(400).json({ message: "Invalid or Expired OTP" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, name, email, password: hashedPassword, age, phone });
        
        delete otpStore[email];
        console.log("✅ User Created:", newUser.email);
        res.status(201).json({ message: "User registered successfully", user: newUser });
    } catch (error) { 
        console.error("❌ Signup Error:", error);
        res.status(500).json({ message: "Error creating user" }); 
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });

        res.status(200).json({
            message: "Login Successful",
            token,
            user: { _id: user._id, name: user.name, email: user.email, pic: user.pic }
        });
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

// Mount Other Routes
app.use('/api/users', userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);

// ================= 5. CLOUDINARY & FIREBASE =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ dest: "uploads/" });

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const result = await cloudinary.uploader.upload(req.file.path, { folder: "aura_chat", resource_type: "auto" });
    fs.unlinkSync(req.file.path);
    res.status(200).json({ url: result.secure_url });
  } catch (error) { 
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: "Upload failed" }); 
  }
});

// Firebase Init
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert({
                ...serviceAccount,
                privateKey: serviceAccount.private_key.replace(/\\n/g, '\n')
            })
        });
        console.log("🔥 Firebase Admin Initialized");
    }
} catch (e) { console.log("⚠️ Firebase Warning (Ignore if not using notifications):", e.message); }

// ================= 6. SOCKET.IO LOGIC =================
const io = new Server(server, {
  pingTimeout: 60000,
  cors: { 
    origin: true, 
    credentials: true,
    methods: ["GET", "POST"]
  },
});

app.set('io', io);
let userSocketMap = {}; 
let liveSessions = {};  
let disconnectTimers = {};

io.on("connection", (socket) => {
  console.log("🔌 Socket Connected:", socket.id);
  const userId = socket.handshake.query.userId;
  
  if (userId && userId !== "undefined") {
      userSocketMap[userId] = socket.id;
      socket.join(userId);
      io.emit("get-users", Object.keys(userSocketMap).map(id => ({ userId: id })));
      socket.emit("update-live-sessions", Object.values(liveSessions));
  }

  // --- Chat Events ---
  socket.on("join_channel", (room) => { if(room) socket.join(room); });
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  // --- Call Events ---
  socket.on("callUser", (data) => {
      const socketId = userSocketMap[data.userToCall];
      if(socketId) io.to(socketId).emit("callUser", { signal: data.signalData, from: data.from, name: data.name });
  });
  socket.on("answerCall", (data) => {
      const socketId = userSocketMap[data.to];
      if(socketId) io.to(socketId).emit("callAccepted", data.signal);
  });

  // --- Live Stream Events ---
  socket.on("start-live", (data) => {
    const { roomId, title, user } = data;
    if (disconnectTimers[roomId]) {
        clearTimeout(disconnectTimers[roomId]);
        delete disconnectTimers[roomId];
    }
    liveSessions[roomId] = { roomId, hostId: socket.id, title, hostData: user, viewers: liveSessions[roomId]?.viewers || [] };
    socket.join(roomId);
    io.emit("update-live-sessions", Object.values(liveSessions));
  });

  socket.on("join-live", ({ roomId, user }) => {
    const session = liveSessions[roomId];
    if (session) {
      socket.join(roomId);
      if(!session.viewers.includes(socket.id)) session.viewers.push(socket.id);
      io.to(session.hostId).emit("viewer-joined", { viewerId: socket.id, user });
      io.emit("update-live-sessions", Object.values(liveSessions));
    }
  });

  socket.on("end-live", (roomId) => {
    if (liveSessions[roomId]) {
      io.to(roomId).emit("live-ended"); 
      delete liveSessions[roomId];
      io.emit("update-live-sessions", Object.values(liveSessions));
    }
  });

  // WebRTC ICE & Offers
  socket.on("live-offer", ({ offer, viewerId }) => io.to(viewerId).emit("live-offer", { offer, hostId: socket.id }));
  socket.on("live-answer", ({ answer, hostId }) => io.to(hostId).emit("live-answer", { answer, viewerId: socket.id }));
  socket.on("live-ice-candidate", ({ candidate, targetId }) => io.to(targetId).emit("live-ice-candidate", { candidate, senderId: socket.id }));

  // Disconnect Handler
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    if (userId) {
        delete userSocketMap[userId];
        io.emit("get-users", Object.keys(userSocketMap).map(id => ({ userId: id })));
    }
    
    // Live Stream Cleanup Timer
    const roomId = Object.keys(liveSessions).find(id => liveSessions[id].hostId === socket.id);
    if (roomId) {
       disconnectTimers[roomId] = setTimeout(() => {
           if (liveSessions[roomId]) {
               io.to(roomId).emit("live-ended");
               delete liveSessions[roomId];
               io.emit("update-live-sessions", Object.values(liveSessions));
           }
       }, 30000); 
    }
  });
});

// ================= 7. START SERVER =================
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
