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

// ================= MIDDLEWARES =================
app.use(express.json());

// Update this list with your actual frontend URLs
const allowedOrigins = [
  "http://localhost:8080", 
  "http://localhost:5173", 
  "http://localhost:3000", 
  "https://your-frontend-url.vercel.app" // Apka production frontend URL yahan zarur dalein
];

app.use(cors({
    origin: allowedOrigins, 
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ HEALTH CHECK ROUTE (Railway Fix)
// Ye route check karega ki server zinda hai ya nahi
app.get('/', (req, res) => {
    res.status(200).send("<h1>✅ Aura Chat Server is Running & Healthy!</h1>");
});

// ================= FIREBASE SETUP =================
try {
    let serviceAccount;
    let privateKey;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        privateKey = serviceAccount.private_key
            ? serviceAccount.private_key.replace(/\\n/g, '\n') 
            : undefined;
    } else {
        try {
            serviceAccount = require("./firebase-service-key.json");
            privateKey = serviceAccount.private_key;
        } catch (e) {
            console.log("⚠️ No local firebase file found, relying on Env Vars.");
        }
    }

    if (serviceAccount && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: privateKey 
            })
        });
        console.log("🔥 Firebase Admin Initialized Successfully");
    } else {
        console.log("⚠️ Firebase Warning: Notifications won't work (Check Env Vars).");
    }
} catch (error) {
    console.log("⚠️ Firebase Config Error: " + error.message);
}

// ================= DB CONNECTION =================
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/Aura-chat';

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
      console.log("❌ DB Error:", err);
      // Agar DB connect na ho to process exit mat karna, taaki logs dikh sakein
  });

// ================= EMAIL SETUP (BREVO SMTP - UPDATED) =================
let otpStore = {}; 

// 🔥 Brevo SMTP Configuration with TLS Fix
// ================= EMAIL SETUP (BREVO SMTP - RAILWAY FIX) =================
const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 2525, // ⚠️ 587 ki jagah 2525 use karein (Ye blocked nahi hota)
    secure: false, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false, // Self-signed certificate fix
        ciphers: "SSLv3"
    },
    // Timeout settings add karein taaki connection hang na ho
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
    logger: true,
    debug: true
});

// Verify Connection
transporter.verify((error, success) => {
    if (error) {
        console.log("❌ Brevo Connection Error:", error);
    } else {
        console.log("✅ Brevo Email Service Ready");
    }
});
  
// Helper Function for Email
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

// ================= ROUTES =================

// 1. Send OTP Route
app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    console.log(`📩 Processing OTP for: ${email}`);

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User exists. Please Login." });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        
        // Store OTP
        otpStore[email] = otp;
        setTimeout(() => { delete otpStore[email] }, 5 * 60 * 1000);

        // Send Email
        await sendOTPEmail(email, otp);
        
        console.log(`✅ OTP Sent to ${email}`);
        res.status(200).json({ message: "OTP sent successfully" });

    } catch (error) {
        console.error("❌ Email Failed:", error); 
        res.status(500).json({ 
            message: "Failed to send email. Check backend logs.", 
            error: error.message 
        });
    }
});

// 2. Verify Signup Route
app.post('/verify-signup', async (req, res) => {
    try {
        const { username, name, email, password, age, phone, otp } = req.body;
        
        if (!otpStore[email] || otpStore[email] !== otp) {
            return res.status(400).json({ message: "Invalid or Expired OTP" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, name, email, password: hashedPassword, age, phone });
        
        delete otpStore[email]; // Clear OTP

        console.log("✅ User Created:", newUser.email);
        res.status(201).json({ message: "User registered successfully", user: newUser });
    } catch (error) { 
        console.error("❌ Signup Error:", error);
        res.status(500).json({ message: "Error creating user" }); 
    }
});

// 3. Login Route
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

// Use Imported Routes
app.use('/api/users', userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);

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

// ================= 🔥 SOCKET LOGIC =================
const io = new Server(server, {
  pingTimeout: 60000,
  cors: { 
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
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
      io.emit("get-users", Object.keys(userSocketMap).map((id) => ({ userId: id })));
      socket.emit("update-live-sessions", Object.values(liveSessions));
  }

  socket.on("join_channel", (room) => {
      if(!room) return;
      socket.join(room);
  });

  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  // Call Logic
  socket.on("callUser", (data) => {
      const socketId = userSocketMap[data.userToCall];
      if(socketId) io.to(socketId).emit("callUser", { signal: data.signalData, from: data.from, name: data.name });
  });
  socket.on("answerCall", (data) => {
      const socketId = userSocketMap[data.to];
      if(socketId) io.to(socketId).emit("callAccepted", data.signal);
  });

  // Live Stream Logic
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

  // WebRTC Signaling
  socket.on("live-offer", ({ offer, viewerId }) => io.to(viewerId).emit("live-offer", { offer, hostId: socket.id }));
  socket.on("live-answer", ({ answer, hostId }) => io.to(hostId).emit("live-answer", { answer, viewerId: socket.id }));
  socket.on("live-ice-candidate", ({ candidate, targetId }) => io.to(targetId).emit("live-ice-candidate", { candidate, senderId: socket.id }));

  socket.on("disconnect", () => {
    console.log("❌ Socket Disconnected:", socket.id);
    if (userId) {
        delete userSocketMap[userId];
        io.emit("get-users", Object.keys(userSocketMap).map((id) => ({ userId: id })));
    }
    
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

// ================= SERVER START (UPDATED) =================
// ⚠️ Railway needs '0.0.0.0' to expose the port publicly
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Open your Railway URL to check health!`);
});
