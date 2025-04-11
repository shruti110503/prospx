// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    name: {
        type: String,
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    profilePic: { type: String }, // No async default, will be set manually
    contactLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "ContactList" }],
    personas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Persona" }],
    authProvider: { type: String, enum: ["local", "google", "linkedin"], default: "local" },

    credits: {
        type: Number,
        default: 0
    },
    stripeCustomerId: {
        type: String
    },
    subscription: {
        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPlan'
        },
        stripeSubscriptionId: {
            type: String
        },
        status: {
            type: String,
            enum: ['active', 'past_due', 'canceled', 'unpaid', 'trialing'],
            default: 'active'
        },
        startDate: {
            type: Date
        },
        nextRenewalDate: {
            type: Date
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to check if password matches
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user has enough credits
userSchema.methods.hasEnoughCredits = function (amount) {
    return this.credits >= amount;
};

// Method to use credits
userSchema.methods.useCredits = async function (amount, reason) {
    if (!this.hasEnoughCredits(amount)) {
        throw new Error('Not enough credits');
    }

    this.credits -= amount;
    await this.save();

    // Record the transaction (this would typically be done by the creditManager utility)
    return true;
};

const User = mongoose.model('User', userSchema);

module.exports = User;