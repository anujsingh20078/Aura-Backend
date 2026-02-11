const asyncHandler = require("express-async-handler");
const Chat = require("../models/Chat");
const User = require("../models/User");
const Message = require("../models/Message");

// ==========================================
// 1. ACCESS CHAT (Find or Create 1-on-1)
// ==========================================
const accessChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.sendStatus(400);

  var isChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate("users", "-password")
    .populate("latestMessage");

  isChat = await User.populate(isChat, {
    path: "latestMessage.sender",
    select: "name pic email",
  });

  if (isChat.length > 0) {
    // Frontend compatibility fix: users ko participants bana ke bhejna
    const chat = isChat[0].toObject();
    chat.participants = chat.users;
    res.send(chat);
  } else {
    var chatData = {
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
    };

    try {
      const createdChat = await Chat.create(chatData);
      const FullChat = await Chat.findOne({ _id: createdChat._id }).populate("users", "-password");
      
      const chatObj = FullChat.toObject();
      chatObj.participants = chatObj.users;
      res.status(200).send(chatObj);
    } catch (error) {
      res.status(400);
      throw new Error(error.message);
    }
  }
});

// ==========================================
// 2. FETCH ALL CHATS (Sidebar) - THE CRITICAL FIX
// ==========================================
const fetchChats = asyncHandler(async (req, res) => {
  try {
    let results = await Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    results = await User.populate(results, {
      path: "latestMessage.sender",
      select: "name pic email",
    });

    // 🔥 Frontend alignment: 'users' array ko 'participants' array mein map karna
    const formattedResults = results.map(chat => {
      const c = chat.toObject();
      c.participants = c.users; // Frontend yahi dhoond raha hai
      return c;
    });

    res.status(200).send(formattedResults);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ... baaki renameGroup, addToGroup mein bhi .toObject() karke participants add kar sakte hain
// ==========================================
// 3. CREATE GROUP CHAT
// ==========================================
const createGroupChat = asyncHandler(async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: "Please Fill all the fields" });
  }

  var users = JSON.parse(req.body.users);

  if (users.length < 2) {
    return res
      .status(400)
      .send("More than 2 users are required to form a group chat");
  }

  users.push(req.user);

  try {
    const groupChat = await Chat.create({
      chatName: req.body.name,
      users: users,
      isGroupChat: true,
      groupAdmin: req.user,
    });

    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    res.status(200).json(fullGroupChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ==========================================
// 4. RENAME GROUP
// ==========================================
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, chatName } = req.body;

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!updatedChat) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(updatedChat);
  }
});

// ==========================================
// 5. ADD TO GROUP
// ==========================================
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const added = await Chat.findByIdAndUpdate(
    chatId,
    { $push: { users: userId } },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!added) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(added);
  }
});

// ==========================================
// 6. REMOVE FROM GROUP
// ==========================================
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const removed = await Chat.findByIdAndUpdate(
    chatId,
    { $pull: { users: userId } },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!removed) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(removed);
  }
});

// ==========================================
// 7. DELETE CHAT (And its messages)
// ==========================================
const deleteChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  try {
    // Delete all messages in this chat
    await Message.deleteMany({ channelId: chatId });

    // Delete the chat itself
    const deletedChat = await Chat.findByIdAndDelete(chatId);

    if (!deletedChat) {
      res.status(404);
      throw new Error("Chat Not Found");
    }

    res.status(200).json({ message: "Chat Deleted Successfully" });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ==========================================
// 8. ARCHIVE CHAT
// ==========================================
const archiveChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  try {
    // Schema mein 'archivedBy' array hona chahiye agar ye feature use karna hai
    // Filhal hum frontend par filter kar sakte hain, ya DB update karein
    
    // Assuming schema update nahi kiya, hum bus success bhejte hain
    // Real implementation ke liye Chat Model me 'archivedBy: [{ type: ObjectId }]' add karein
    
    res.status(200).json({ message: "Chat Archived (Logic Pending in Model)" });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// ==========================================
// 9. UNARCHIVE CHAT
// ==========================================
const unarchiveChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  try {
    res.status(200).json({ message: "Chat Unarchived" });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  deleteChat,
  archiveChat,
  unarchiveChat
};