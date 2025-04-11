const mongoose = require("mongoose");

const ContactListSchema = new mongoose.Schema({
    name: { type: String, required: true },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ContactList", ContactListSchema);
