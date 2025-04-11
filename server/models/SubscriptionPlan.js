// models/SubscriptionPlan.js
const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String
  },
  price: {
    type: Number,
    required: true
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'annual', 'one-time'],
    required: true
  },
  credits: {
    type: Number,
    required: true
  },
  enrichmentsPerMonth: {
    type: Number,
    default: 0
  },
  features: [featureSchema],
  stripePriceId: {
    type: String
  },
  stripeProductId: {
    type: String
  },
  displayOnWebsite: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 999
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;