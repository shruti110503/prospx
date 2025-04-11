// scripts/creditScheduler.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const creditManager = require('../utils/creditManager');
const config = require('../config');
mongoose.connect(config.mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

/**
 * This script handles scheduled credit management tasks:
 * 1. Expiring unused credits when subscription periods end
 * 2. Processing free plan renewals (not handled by Stripe)
 * 
 * This should be run daily using a cron job or similar scheduler
 */
async function processCreditTasks() {
    try {
        console.log('Starting credit management tasks:', new Date().toISOString());
        
        // Process expired subscriptions (credits should expire)
        await processExpiredCredits();
        
        // Process free plan renewals
        await processFreePlanRenewals();
        
        console.log('Credit management tasks completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error processing credit tasks:', error);
        process.exit(1);
    }
}

/**
 * Process expired credits for subscriptions that have ended
 */
async function processExpiredCredits() {
    console.log('Processing expired credits...');
    
    const today = new Date();
    
    // Find users whose subscription has ended and who have credits remaining
    const users = await User.find({
        'subscription.cancelAtPeriodEnd': true,
        'subscription.nextRenewalDate': { $lt: today },
        'credits': { $gt: 0 }
    }).populate('subscription.planId');
    
    console.log(`Found ${users.length} users with expired subscriptions and remaining credits`);
    
    for (const user of users) {
        const plan = user.subscription.planId;
        if (!plan) continue;
        
        try {
            // Expire remaining credits
            console.log(`Expiring ${user.credits} credits for user ${user._id} (${user.email})`);
            
            await creditManager.expireCredits(
                user._id,
                user.credits,
                `Subscription ended - Unused credits expired`
            );
            
            console.log(`Credits expired for user ${user._id}`);
        } catch (error) {
            console.error(`Error expiring credits for user ${user._id}:`, error);
        }
    }
}

/**
 * Process renewals for free plans (not handled by Stripe)
 */
async function processFreePlanRenewals() {
    console.log('Processing free plan renewals...');
    
    const today = new Date();
    
    // Find users on free plans whose renewal date has passed
    const users = await User.find({
        'subscription.planId': { $exists: true },
        'subscription.nextRenewalDate': { $lt: today }
    }).populate('subscription.planId');
    
    console.log(`Found ${users.length} users due for plan renewal check`);
    
    for (const user of users) {
        const plan = user.subscription.planId;
        if (!plan || plan.price > 0) continue; // Skip paid plans (handled by Stripe)
        
        try {
            console.log(`Processing free plan renewal for user ${user._id}`);
            
            // Update next renewal date
            let nextRenewal = new Date(user.subscription.nextRenewalDate);
            if (plan.billingCycle === 'monthly') {
                nextRenewal.setMonth(nextRenewal.getMonth() + 1);
            } else if (plan.billingCycle === 'annual') {
                nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
            } else {
                continue; // Skip one-time plans
            }
            
            user.subscription.nextRenewalDate = nextRenewal;
            await user.save();
            
            // Add new credits
            await creditManager.addCredits(
                user._id,
                plan.credits,
                `Free ${plan.name} plan renewal`
            );
            
            console.log(`Renewed free plan for user ${user._id}, next renewal: ${nextRenewal}`);
        } catch (error) {
            console.error(`Error renewing free plan for user ${user._id}:`, error);
        }
    }
}

processCreditTasks();