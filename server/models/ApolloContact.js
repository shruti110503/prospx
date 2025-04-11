// Your existing ApolloContact model
const mongoose = require("mongoose");

const ApolloContactSchema = new mongoose.Schema({
    linkedinUrl: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        default: null
    },
    phone: {
        type: String,
        trim: true,
        default: null
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    // Track API call status and results
    apolloApiStatus: {
        emailFetched: {
            type: Boolean,
            default: false
        },
        phoneFetched: {
            type: Boolean,
            default: false
        },
        lastAttempt: {
            type: Date,
            default: null
        }
    }
});

// Create index on linkedinUrl for faster lookups
ApolloContactSchema.index({ linkedinUrl: 1 });

module.exports = mongoose.model("ApolloContact", ApolloContactSchema);