const mongoose = require("mongoose");

const channelSchema = mongoose.Schema(
  {
    name: { type: String, trim: true }, // Group ka naam (DM me khali ho sakta hai)
    isGroup: { type: Boolean, default: false }, // DM hai ya Group
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] 
  },
  { timestamps: true }



);

module.exports = mongoose.model("Channel", channelSchema);