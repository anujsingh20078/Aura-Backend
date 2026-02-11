const { Server } = require("socket.io");
const http = require("http");
const express = require("express");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://localhost:8080", "http://localhost:3000"], // Apne ports check karein
        methods: ["GET", "POST"],
    },
});

// 1. Map: {userId: socketId}
const userSocketMap = {}; 

// Helper for Controller
const getReceiverSocketId = (receiverId) => {
    return userSocketMap[receiverId];
};

io.on("connection", (socket) => {
    console.log("a user connected", socket.id);

    // 2. User Online Logic
    const userId = socket.handshake.query.userId;
    
    if (userId && userId !== "undefined") {
        userSocketMap[userId] = socket.id;
    }

    // ✅ FIX 1: Event Name & Data Format Corrected
    // Frontend 'get-users' sun raha hai aur object array expect kar raha hai
    io.emit("get-users", Object.keys(userSocketMap).map(id => ({ userId: id })));

    // ✅ FIX 2: Join Room Logic (CRITICAL FOR MESSAGES)
    // Iske bina real-time message nahi aayega!
    socket.on("join_channel", (room) => {
        socket.join(room);
        console.log("User Joined Room: " + room);
    });

    // Optional: Typing Indicators
    socket.on("typing", (room) => socket.in(room).emit("typing"));
    socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

    // Disconnect Logic
    socket.on("disconnect", () => {
        console.log("user disconnected", socket.id);
        if (userId) {
            delete userSocketMap[userId];
        }
        // Update list for everyone
        io.emit("get-users", Object.keys(userSocketMap).map(id => ({ userId: id })));
    });
});

module.exports = { app, io, server, getReceiverSocketId };