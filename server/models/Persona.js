const mongoose = require("mongoose");

const PersonaSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    filters: Object, // Store parsed Sales Navigator filters
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Persona", PersonaSchema);
