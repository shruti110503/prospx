const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const config = require('../config');

// Connect to MongoDB
mongoose.connect(config.mongoUri)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Define the subscription plans
const subscriptionPlans = [
    {
        name: "Free Plan",
        price: 0,
        billingCycle: "monthly",
        credits: 50,
        enrichmentsPerMonth: 50,
        features: [
            { name: "Auto-Pilot", enabled: true },
            { name: "Reasoning", enabled: false }
        ],
        displayOnWebsite: true,
        sortOrder: 1
    },
    {
        name: "Startup Pro Monthly",
        price: 25,
        billingCycle: "monthly",
        credits: 500,
        enrichmentsPerMonth: 500,
        features: [
            { name: "Auto-Pilot", enabled: true },
            { name: "Reasoning", enabled: false }
        ],
        displayOnWebsite: true,
        sortOrder: 2
    },
    {
        name: "Startup Pro Annual",
        price: 240,
        billingCycle: "annual",
        credits: 500,  // 500 credits per month with annual billing
        enrichmentsPerMonth: 500,
        features: [
            { name: "Auto-Pilot", enabled: true },
            { name: "Reasoning", enabled: false }
        ],
        displayOnWebsite: true,
        sortOrder: 3
    },
    {
        name: "Enterprise Monthly",
        price: 45,
        billingCycle: "monthly",
        credits: 2000,
        enrichmentsPerMonth: 2000,
        features: [
            { name: "Auto-Pilot", enabled: true },
            { name: "Reasoning", enabled: false }
        ],
        displayOnWebsite: true,
        sortOrder: 4
    },
    {
        name: "Enterprise Annual",
        price: 480,
        billingCycle: "annual",
        credits: 2000,  // 2000 credits per month with annual billing
        enrichmentsPerMonth: 2000,
        features: [
            { name: "Auto-Pilot", enabled: true },
            { name: "Reasoning", enabled: false }
        ],
        displayOnWebsite: true,
        sortOrder: 5
    },
    {
        name: "Additional Credits",
        price: 30,
        billingCycle: "one-time",
        credits: 500,
        enrichmentsPerMonth: 0,
        features: [],
        displayOnWebsite: false,
        sortOrder: 6
    }
];

// Insert or update subscription plans
async function setupPlans() {
    try {
        for (const plan of subscriptionPlans) {
            await SubscriptionPlan.findOneAndUpdate(
                { name: plan.name },
                plan,
                { upsert: true, new: true }
            );
            console.log(`Plan created/updated: ${plan.name}`);
        }
        console.log('All subscription plans have been set up!');
        mongoose.disconnect();
    } catch (error) {
        console.error('Error setting up subscription plans:', error);
        mongoose.disconnect();
    }
}

setupPlans();