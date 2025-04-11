// scripts/syncStripeProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');

const stripe = require('stripe')(config.stripSecretKey);
const SubscriptionPlan = require('../models/SubscriptionPlan');

mongoose.connect(config.mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

/**
 * This script synchronizes your subscription plans with Stripe
 * It creates/updates products and prices in Stripe for each plan
 */
async function syncPlansWithStripe() {
    try {
        const plans = await SubscriptionPlan.find({});
        console.log(`Found ${plans.length} plans to sync with Stripe`);

        for (const plan of plans) {
            console.log(`Processing plan: ${plan.name}`);

            // Skip the free plan for Stripe product creation
            if (plan.price === 0) {
                console.log(`Skipping free plan: ${plan.name}`);
                continue;
            }

            // Create or update the product in Stripe
            let stripeProduct;
            if (plan.stripeProductId) {
                // Update existing product
                try {
                    stripeProduct = await stripe.products.update(
                        plan.stripeProductId,
                        {
                            name: plan.name,
                            description: plan.description || `${plan.name} - ${plan.credits} credits`,
                            metadata: {
                                planId: plan._id.toString(),
                                credits: plan.credits.toString(),
                                billingCycle: plan.billingCycle
                            },
                            active: plan.active
                        }
                    );
                    console.log(`Updated product: ${stripeProduct.id}`);
                } catch (err) {
                    if (err.code === 'resource_missing') {
                        // Product doesn't exist in Stripe, create a new one
                        plan.stripeProductId = null;
                    } else {
                        throw err;
                    }
                }
            }

            if (!plan.stripeProductId) {
                // Create new product
                stripeProduct = await stripe.products.create({
                    name: plan.name,
                    description: plan.description || `${plan.name} - ${plan.credits} credits`,
                    metadata: {
                        planId: plan._id.toString(),
                        credits: plan.credits.toString(),
                        billingCycle: plan.billingCycle
                    }
                });

                // Update plan with new product ID
                plan.stripeProductId = stripeProduct.id;
                console.log(`Created product: ${stripeProduct.id}`);
            }

            // Now handle the price
            let stripePrice;
            if (plan.stripePriceId) {
                // Price exists, but we can't update the amount
                // We'll retrieve it to confirm it matches our plan
                try {
                    stripePrice = await stripe.prices.retrieve(plan.stripePriceId);
                    console.log(`Found existing price: ${stripePrice.id}`);

                    // Check if price amount matches
                    const currentPriceInCents = plan.price * 100;
                    if (stripePrice.unit_amount !== currentPriceInCents) {
                        console.log(`Price amount mismatch: Stripe=${stripePrice.unit_amount}, DB=${currentPriceInCents}`);
                        // We need to create a new price since we can't update the amount
                        stripePrice = null;
                        // Archive the old price
                        await stripe.prices.update(plan.stripePriceId, { active: false });
                        console.log(`Archived old price: ${plan.stripePriceId}`);
                        plan.stripePriceId = null;
                    }
                } catch (err) {
                    if (err.code === 'resource_missing') {
                        console.log(`Price ${plan.stripePriceId} not found in Stripe`);
                        plan.stripePriceId = null;
                        stripePrice = null;
                    } else {
                        throw err;
                    }
                }
            }

            if (!plan.stripePriceId) {
                // Create a new price
                const priceData = {
                    product: plan.stripeProductId,
                    unit_amount: plan.price * 100, // Stripe uses cents
                    currency: 'usd',
                    metadata: {
                        planId: plan._id.toString()
                    }
                };

                // Add recurring parameters for subscription plans
                if (plan.billingCycle === 'monthly' || plan.billingCycle === 'annual') {
                    priceData.recurring = {
                        interval: plan.billingCycle === 'monthly' ? 'month' : 'year',
                        usage_type: 'licensed'
                    };
                }

                stripePrice = await stripe.prices.create(priceData);
                console.log(`Created price: ${stripePrice.id}`);

                // Update plan with new price ID
                plan.stripePriceId = stripePrice.id;
            }

            // Save the updated plan
            await plan.save();
            console.log(`Saved plan with Stripe IDs: Product=${plan.stripeProductId}, Price=${plan.stripePriceId}`);
        }

        console.log('Stripe sync completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error syncing with Stripe:', error);
        process.exit(1);
    }
}

syncPlansWithStripe();