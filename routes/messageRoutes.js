const express = require("express");
const router = express.Router();

// ✅ FIX: Curly braces
const { verifyToken } = require("../middlewares/auth"); 
const { sendMessage, allMessages, clearMessages } = require("../controllers/messageController");

router.post("/", verifyToken, sendMessage);
router.get("/:chatId", verifyToken, allMessages);
router.delete("/:chatId/clear", verifyToken, clearMessages); // Agar ye route hai

module.exports = router;