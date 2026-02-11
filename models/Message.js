const mongoose = require("mongoose");

const messageSchema = mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // User model se link
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat", // ⚠️ CHECK: Agar aapka model name "Channel" hai to yahan "Channel" likhein
      required: true,
    },
    // ✅ NEW FIELD: Message type (text, image, video) handle karne ke liye
    type: {
        type: String,
        default: "text",
        enum: ["text", "image", "video", "file"] 
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true, // CreatedAt aur UpdatedAt auto-generate honge
  }
);

module.exports = mongoose.model("Message", messageSchema);