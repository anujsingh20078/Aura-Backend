const express = require("express");
const router = express.Router();

// ✅ FIX: Curly braces { } ZAROORI HAIN kyunki auth.js named export use kar raha hai
const { verifyToken } = require("../middlewares/auth");

const { 
    accessChat, 
    fetchChats, 
    createGroupChat, // Agar group chat hai to ye bhi chahiye
    renameGroup,
    addToGroup,
    removeFromGroup,
    deleteChat, 
    archiveChat, 
    unarchiveChat 
} = require("../controllers/chatController");

// Debugging: Agar ye print ho raha hai to matlab import sahi hai
if (!verifyToken) console.error("❌ CRITICAL: verifyToken function import nahi hua!");

// Route 1: Chat Access (One-on-One)
router.post("/", verifyToken, accessChat);

// Route 2: Fetch All Chats (Sidebar)
router.get("/", verifyToken, fetchChats);

// Route 3: Group Chats (Agar controller mein hain)
if (createGroupChat) router.post("/group", verifyToken, createGroupChat);
if (renameGroup) router.put("/rename", verifyToken, renameGroup);
if (addToGroup) router.put("/groupadd", verifyToken, addToGroup);
if (removeFromGroup) router.put("/groupremove", verifyToken, removeFromGroup);

// Route 4: Delete Chat
router.delete("/:chatId", verifyToken, deleteChat);

// Route 5: Archive/Unarchive
router.put("/:chatId/archive", verifyToken, archiveChat);
router.put("/:chatId/unarchive", verifyToken, unarchiveChat);

module.exports = router;