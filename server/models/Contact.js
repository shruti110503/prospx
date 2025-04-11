const mongoose = require("mongoose");  

const ContactSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  linkedinUrl: { type: String },
  position: { type: String },
  company: { type: String },
  location: { type: String },
  industry: { type: String },
  connections: { type: String }, // Changed to String since LinkedIn returns this as a string
  lastActivity: { type: Date },
  notes: { type: String },
  tags: [{ type: String }],
  addedAt: { type: Date, default: Date.now },
  profileImageUrl: { type: String },
  personaRelation: { type: String } // This will store the relation text
});

module.exports = mongoose.model("Contact", ContactSchema);