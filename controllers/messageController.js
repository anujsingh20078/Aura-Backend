const asyncHandler = require("express-async-handler");
const Message = require("../models/Message");
const User = require("../models/User");
const Chat = require("../models/Chat"); // ⚠️ Check karein: Aapka file name Chat.js hai ya Channel.js

// ==========================================
// 1. SEND MESSAGE (Optimized for Real-Time)
// ==========================================
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId, type } = req.body;

  if (!content || !chatId) {
    console.log("❌ Invalid data passed into request");
    return res.sendStatus(400);
  }

  // 1. Create Message Data
  var newMessage = {
    senderId: req.user._id,
    content: content,
    channelId: chatId, // Schema mein field ka naam 'channelId' ya 'chat' check karein
    type: type || "text",
  };

  try {
    // 2. Database Create
    var message = await Message.create(newMessage);

    // 3. Deep Populate (Zaroori hai taaki frontend par photo/name dikhe)
    // Step A: Populate Sender
    message = await message.populate("senderId", "name pic email");
    
    // Step B: Populate Chat info
    message = await message.populate("channelId");
    
    // Step C: Populate Users inside that Chat
    message = await User.populate(message, {
      path: "channelId.users", // ⚠️ Model mein 'users' hota hai usually
      select: "name pic email",
    });

    // 4. Update Latest Message in Chat Model (Sidebar update ke liye)
    await Chat.findByIdAndUpdate(req.body.chatId, {
      latestMessage: message,
    });

    // 5. 🔥 DATA TRANSFORMATION (Frontend Fix)
    // Frontend 'participants' dhoond raha hai, lekin DB 'users' deta hai.
    // Hum isse manually convert karke bhejenge.
    let msgToSend = message.toObject();
    if (msgToSend.channelId && msgToSend.channelId.users) {
        msgToSend.channelId.participants = msgToSend.channelId.users;
    }

    // 6. 🚀 SOCKET EMISSION
    // Server.js se 'io' instance access karein
    const io = req.app.get("io");
    if(io) {
        console.log(`📡 Emitting message to room: ${chatId}`);
        io.to(chatId).emit("receive_message", msgToSend);
    } else {
        console.log("❌ Socket IO not found on req.app");
    }

    res.json(msgToSend);

  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ==========================================
// 2. FETCH ALL MESSAGES
// ==========================================
const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ channelId: req.params.chatId })
      .populate("senderId", "name pic email")
      .populate("channelId");
      
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ==========================================
// 3. CLEAR MESSAGES
// ==========================================
const clearMessages = asyncHandler(async (req, res) => {
    try {
        await Message.deleteMany({ channelId: req.params.chatId });
        res.status(200).json({ message: "Chat cleared" });
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});

module.exports = { sendMessage, allMessages, clearMessages };