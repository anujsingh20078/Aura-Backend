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

const User = require("./models/User"); 

const PORT = process.env.PORT || 5000;

// ================= FIREBASE SETUP (Safe Mode) =================
// ================= FIREBASE SETUP (Safe Mode & Render Compatible) =================
// try {
//     let serviceAccount;

//     // Check karein ki hum Render par hain ya Local
//     if (process.env.FIREBASE_SERVICE_ACCOUNT) {
//     console.log("Raw Env Var (First 50 chars):", process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 50)); // Ye line add karein check karne ke liye
    
//     try {
//         serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
//     } catch (e) {
//         console.error("JSON Parse Failed:", e.message);
//     }
// }
//     admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount)
//     });
//     console.log("🔥 Firebase Admin Initialized");
// } catch (error) {
//     console.log("⚠️ Firebase Config Error: " + error.message);
//     console.log("⚠️ Notifications won't work until Key is fixed.");
// }
// ================= FIREBASE SETUP (Safe Mode & Render Compatible) =================
// ================= FIREBASE SETUP (Safe Mode & Render Compatible) =================
// ================= FIREBASE SETUP (Robust Fix) =================
try {
    let serviceAccount;
    let privateKey;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // 1. Parse JSON from Env
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // 2. Fix Private Key (Handle both cases: literal \n and encoded \\n)
        privateKey = serviceAccount.private_key
            ? serviceAccount.private_key.replace(/\\n/g, '\n') 
            : undefined;

    } else {
        // 1. Local File
        serviceAccount = require("./firebase-service-key.json");
        privateKey = serviceAccount.private_key;
    }

    // 3. Robust Check: Initialize Firebase
    if (serviceAccount && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: privateKey // <-- Isse direct pass karein
            })
        });
        console.log("🔥 Firebase Admin Initialized Successfully");
    } else {
        throw new Error("Missing Private Key or Service Account data");
    }

} catch (error) {
    console.log("⚠️ Firebase Config Error: " + error.message);
    // Debugging (Isse turant pata chal jayega agar format galat hai)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log("🔍 Private Key Start:", JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).private_key.substring(0, 35));
    }
    console.log("⚠️ Notifications won't work until Key is fixed.");
}
const app = express();
const server = http.createServer(app);

// ================= 🔥 SOCKET.IO SETUP =================
const io = new Server(server, {
  pingTimeout: 60000,
  cors: { 
    // Frontend ke saare possible URLs allow karein
    origin: ["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
});

// Make IO accessible in Controllers
app.set('io', io);

// ================= MIDDLEWARES =================
app.use(express.json());
app.use(cors({
    origin: ["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"], 
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ================= DB CONNECTION =================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/Aura-chat')
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// ================= EMAIL SETUP =================
let otpStore = {}; 
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Helper Function for Email
const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: `"Aura Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Verify your Aura Account',
        html: `<div style="padding:20px;"><h3>Your OTP is: <b>${otp}</b></h3></div>`
    };
    return transporter.sendMail(mailOptions);
};

// ================= ROUTES IMPORT =================
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");

// Use Routes
app.use('/api/users', userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);


// ================= AUTH ROUTES (Direct in Server) =================
// Note: Behtar hoga inhe userController mein shift karein, par yahan bhi chalega
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

app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User exists. Please Login." });

        const otp = crypto.randomInt(100000, 999999).toString();
        otpStore[email] = otp;
        setTimeout(() => { delete otpStore[email] }, 5 * 60 * 1000);

        await sendOTPEmail(email, otp);
        res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) { res.status(500).json({ message: "Failed to send email" }); }
});

app.post('/verify-signup', async (req, res) => {
    try {
        const { username, name, email, password, age, phone, otp } = req.body;
        if (!otpStore[email] || otpStore[email] !== otp) return res.status(400).json({ message: "Invalid OTP" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, name, email, password: hashedPassword, age, phone });
        delete otpStore[email];

        res.status(201).json({ message: "User registered", user: newUser });
    } catch (error) { res.status(500).json({ message: "Error creating user" }); }
});

// FCM Token
app.put("/api/users/fcm-token", async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ message: "Required fcmToken" });
        
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
        
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        
        await User.findByIdAndUpdate(decoded.id, { fcmToken: fcmToken });
        res.status(200).send("Token updated");
    } catch (error) { res.status(500).send(error.message); }
});

// ================= CLOUDINARY SETUP =================
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

// ================= 🔥 SOCKET LOGIC (Fixed for Real-Time) =================
let userSocketMap = {}; 
let liveSessions = {};  
let disconnectTimers = {};

io.on("connection", (socket) => {
  console.log("🔌 Socket Connected:", socket.id);

  // 1. User Setup
  const userId = socket.handshake.query.userId;
  if (userId && userId !== "undefined") {
      userSocketMap[userId] = socket.id;
      socket.join(userId); 
      io.emit("get-users", Object.keys(userSocketMap).map((id) => ({ userId: id })));
      socket.emit("update-live-sessions", Object.values(liveSessions));
      console.log(`👤 User Map Updated: ${userId}`);
  }

  // 2. Chat Room Join (The most important part for messaging)
  socket.on("join_channel", (room) => {
      if(!room) return;
      socket.join(room);
      console.log(`✅ User ${socket.id} JOINED Room: ${room}`); 
  });

  // 3. Typing Indicators
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  // 4. Call Logic
  socket.on("callUser", (data) => {
      const socketId = userSocketMap[data.userToCall];
      if(socketId) io.to(socketId).emit("callUser", { signal: data.signalData, from: data.from, name: data.name });
  });
  socket.on("answerCall", (data) => {
      const socketId = userSocketMap[data.to];
      if(socketId) io.to(socketId).emit("callAccepted", data.signal);
  });

  // 5. Live Stream Logic
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

  // WebRTC Signaling for Live
  socket.on("live-offer", ({ offer, viewerId }) => io.to(viewerId).emit("live-offer", { offer, hostId: socket.id }));
  socket.on("live-answer", ({ answer, hostId }) => io.to(hostId).emit("live-answer", { answer, viewerId: socket.id }));
  socket.on("live-ice-candidate", ({ candidate, targetId }) => io.to(targetId).emit("live-ice-candidate", { candidate, senderId: socket.id }));

  // 6. Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Socket Disconnected:", socket.id);
    if (userId) {
        delete userSocketMap[userId];
        io.emit("get-users", Object.keys(userSocketMap).map((id) => ({ userId: id })));
    }
    
    // Live Stream Cleanup
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

// ================= SERVER START =================
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { app, io, server };