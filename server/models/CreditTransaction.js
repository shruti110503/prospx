// models/CreditTransaction.js
const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    reason: { type: String, required: true },

    type: {
        type: String,
        enum: ['add', 'use', 'expire'],
    },
    description: {
        type: String,
    },
    date: {
        type: Date,
        default: Date.now
    },
    balanceAfter: {
        type: Number
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

// Index for efficient user-based queries
creditTransactionSchema.index({ user: 1, date: -1 });

const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);

module.exports = CreditTransaction;