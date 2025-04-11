// controllers/subscriptionController.js
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const creditManager = require('../utils/creditManager');
const config = require('../config');

const stripe = require('stripe')(config.stripSecretKey);
const pendingSubscriptionUpdates = new Map();

// Get all subscription plans that should be displayed on website
exports.getSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ displayOnWebsite: true })
            .sort({ sortOrder: 1 });

        res.json({ plans });
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get user's current credit balance and transaction history
exports.getUserCreditInfo = async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId).select('credits subscription');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const transactions = await CreditTransaction.find({ user: userId })
            .sort({ date: -1 })
            .limit(20);

        // Get subscription details if user has one
        let subscriptionDetails = null;
        if (user.subscription && user.subscription.stripeSubscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(
                user.subscription.stripeSubscriptionId
            );

            if (subscription) {
                const plan = await SubscriptionPlan.findById(user.subscription.planId);
                subscriptionDetails = {
                    id: subscription.id,
                    status: subscription.status,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    plan: plan ? {
                        name: plan.name,
                        credits: plan.credits,
                        price: plan.price,
                        billingCycle: plan.billingCycle
                    } : null
                };
            }
        } else if (user.subscription && user.subscription.planId) {
            // For free plans without Stripe subscription ID
            const plan = await SubscriptionPlan.findById(user.subscription.planId);
            subscriptionDetails = {
                status: user.subscription.status || 'active',
                currentPeriodEnd: user.subscription.nextRenewalDate,
                cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd || false,
                plan: plan ? {
                    name: plan.name,
                    credits: plan.credits,
                    price: plan.price,
                    billingCycle: plan.billingCycle
                } : null
            };
        }

        res.json({
            credits: user.credits,
            subscription: subscriptionDetails,
            transactions
        });
    } catch (error) {
        console.error('Error fetching user credit info:', error);
        res.status(500).json({ error: error.message });
    }
};

const hasActivePaidSubscription = async (userId) => {
    const user = await User.findById(userId).select('subscription');

    if (!user || !user.subscription || !user.subscription.planId) {
        return false;
    }

    // Get plan details to check if it's a free plan
    const plan = await SubscriptionPlan.findById(user.subscription.planId);

    // User must have an active subscription that is not free
    return (
        user.subscription.status === 'active' &&
        plan &&
        plan.price > 0
    );
};


// Get additional credits plan
exports.getAdditionalCreditsPlan = async (req, res) => {
    try {
        const creditPlan = await SubscriptionPlan.findOne({
            name: "Additional Credits",
            billingCycle: "one-time"
        });

        if (!creditPlan) {
            return res.status(404).json({ message: 'Additional credits plan not found' });
        }

        res.json({ plan: creditPlan });
    } catch (error) {
        console.error('Error fetching additional credits plan:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create a Stripe Checkout Session for one-time purchase
exports.createCheckoutSession = async (req, res) => {
    try {
        const { planId, quantity = 1 } = req.body;  // Add quantity parameter
        const userId = req.user.userId;

        // Retrieve the selected plan
        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        const totalCredits = plan.credits * quantity;
        const totalPrice = plan.price * quantity;

        // Create a checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${plan.name} - ${plan.credits} Credits (${quantity}x)`,
                        },
                        unit_amount: plan.price * 100, // Stripe needs price in cents
                    },
                    quantity: quantity,
                },
            ],
            mode: 'payment',
            success_url: `${config.clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.clientUrl}/pricing`,
            client_reference_id: userId,
            metadata: {
                type: 'credits_purchase',
                planId: planId,
                userId: userId,
                credits: plan.credits.toString(),
                quantity: quantity.toString(), // Include quantity in metadata
                totalCredits: totalCredits.toString()
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.purchaseCredits = async (req, res) => {
    try {
        const { planId, quantity = 1 } = req.body;
        const userId = req.user.userId;

        // Validate quantity
        const parsedQuantity = parseInt(quantity);
        if (isNaN(parsedQuantity) || parsedQuantity < 1) {
            return res.status(400).json({
                message: 'Invalid quantity. Please provide a positive number.'
            });
        }

        // Retrieve the selected plan
        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        // Calculate total credits and price
        const totalCredits = plan.credits * parsedQuantity;
        const totalPrice = plan.price * parsedQuantity;

        // Create a checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${plan.name} - ${plan.credits} Credits (${parsedQuantity}x)`,
                        },
                        unit_amount: plan.price * 100, // Stripe needs price in cents
                    },
                    quantity: parsedQuantity,
                },
            ],
            mode: 'payment',
            success_url: `${config.clientUrl}/dashboard?credits_purchased=true`,
            cancel_url: `${config.clientUrl}/dashboard`,
            metadata: {
                type: 'credits_purchase',
                planId: planId,
                userId: userId,
                credits: plan.credits.toString(),
                quantity: parsedQuantity.toString(),
                totalCredits: totalCredits.toString()  // ENSURE THIS IS SET
            },
        });

        res.json({
            sessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('[ERROR] Purchasing credits:', error);
        res.status(500).json({ error: error.message });
    }
};


// Subscribe to plan with Stripe
exports.subscribeToPlan = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.userId;

        // Retrieve the selected plan
        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        if (plan.price === 0) {
            // Free plan - just update the user directly
            const nextRenewalDate = getNextRenewalDate(plan.billingCycle);

            await User.findByIdAndUpdate(userId, {
                'subscription.planId': plan._id,
                'subscription.status': 'active',
                'subscription.startDate': new Date(),
                'subscription.nextRenewalDate': nextRenewalDate,
            });

            return res.json({
                message: 'Successfully subscribed to free plan',
                plan: {
                    name: plan.name,
                    credits: plan.credits
                }
            });
        }

        // Check if user already has a Stripe customer ID
        let user = await User.findById(userId);
        let stripeCustomerId = user.stripeCustomerId;

        // Create a customer in Stripe if not exists
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: userId
                }
            });

            stripeCustomerId = customer.id;
            await User.findByIdAndUpdate(userId, { stripeCustomerId });
        }

        // For paid plans, create a checkout session
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: plan.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${config.clientUrl}/dashboard?subscription_success=true`,
            cancel_url: `${config.clientUrl}/pricing`,
            client_reference_id: userId,
            metadata: {
                type: 'subscription',
                planId: planId,
                userId: userId,
                isInitialSubscription: 'true' // Flag to identify first-time subscriptions
            },
        });

        res.json({
            sessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('Error subscribing to plan:', error);
        res.status(500).json({ error: error.message });
    }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select('subscription');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // No subscription at all case
        if (!user.subscription || !user.subscription.planId) {
            return res.status(404).json({ message: 'No active subscription found' });
        }

        // Get the plan details
        const plan = await SubscriptionPlan.findById(user.subscription.planId);

        // Handle free plan case - these don't have Stripe subscription IDs
        if (plan && plan.price === 0) {
            user.subscription.cancelAtPeriodEnd = true;
            await user.save();

            return res.json({
                message: 'Free plan will be canceled at the end of the current billing period',
                subscription: {
                    id: null,
                    currentPeriodEnd: user.subscription.nextRenewalDate,
                    cancelAtPeriodEnd: true
                }
            });
        }

        // Handle paid subscription case (with Stripe)
        if (!user.subscription.stripeSubscriptionId) {
            // Subscription has a plan but no Stripe ID - data inconsistency
            console.log('Subscription data inconsistency for user:', userId);

            // Update the subscription to be canceled
            user.subscription.cancelAtPeriodEnd = true;
            await user.save();

            return res.json({
                message: 'Subscription records updated',
                subscription: {
                    id: null,
                    currentPeriodEnd: user.subscription.nextRenewalDate,
                    cancelAtPeriodEnd: true
                }
            });
        }

        try {
            // Try to get the subscription from Stripe first to verify it exists
            const stripeSubscription = await stripe.subscriptions.retrieve(
                user.subscription.stripeSubscriptionId
            );

            // If subscription already canceled or doesn't exist, just update our records
            if (!stripeSubscription || stripeSubscription.status !== 'active') {
                await User.findByIdAndUpdate(userId, {
                    'subscription.cancelAtPeriodEnd': true,
                    'subscription.status': 'inactive'
                });

                return res.json({
                    message: 'Subscription records updated',
                    subscription: {
                        id: user.subscription.stripeSubscriptionId,
                        currentPeriodEnd: user.subscription.nextRenewalDate,
                        cancelAtPeriodEnd: true
                    }
                });
            }

            // Otherwise cancel the active subscription
            const subscription = await stripe.subscriptions.update(
                user.subscription.stripeSubscriptionId,
                { cancel_at_period_end: true }
            );

            // Update user document
            user.subscription.cancelAtPeriodEnd = true;
            await user.save();

            res.json({
                message: 'Subscription will be canceled at the end of the current billing period',
                subscription: {
                    id: subscription.id,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    cancelAtPeriodEnd: subscription.cancel_at_period_end
                }
            });
        } catch (stripeError) {
            console.error('Stripe subscription error:', stripeError);

            // If Stripe can't find the subscription, update our records
            if (stripeError.code === 'resource_missing') {
                await User.findByIdAndUpdate(userId, {
                    'subscription.cancelAtPeriodEnd': true,
                    'subscription.status': 'inactive',
                    'subscription.stripeSubscriptionId': null
                });

                return res.json({
                    message: 'Subscription not found in Stripe. Records updated.',
                    subscription: {
                        id: null,
                        currentPeriodEnd: user.subscription.nextRenewalDate,
                        cancelAtPeriodEnd: true
                    }
                });
            }

            throw stripeError;
        }
    } catch (error) {
        console.error('Error canceling subscription:', error);
        res.status(500).json({ error: error.message });
    }
};
// Handle Stripe webhook events
exports.handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, config.stripeWebHookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        console.log(`Received webhook event: ${event.type}`);

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error handling webhook event:', error);
        res.status(500).json({ error: error.message });
    }
};
// Handle successful checkout completion
async function handleCheckoutCompleted(session) {
    console.log('[WEBHOOK] Detailed Checkout Session:', JSON.stringify(session, null, 2));

    const { metadata } = session;

    if (!metadata || !metadata.userId || !metadata.planId) {
        console.error('[WEBHOOK ERROR] Missing critical metadata:', metadata);
        return;
    }

    const userId = metadata.userId;
    const planId = metadata.planId;

    console.log(`[WEBHOOK] Processing for UserId: ${userId}, PlanId: ${planId}`);
    if (metadata.type === 'subscription' && session.subscription) {
        console.log('[WEBHOOK] Subscription checkout - Credits will be added via invoice webhook');

        // Transfer metadata to the subscription
        try {
            await stripe.subscriptions.update(
                session.subscription,
                {
                    metadata: {
                        userId: metadata.userId,
                        planId: metadata.planId,
                        isInitialSubscription: metadata.isInitialSubscription
                    }
                }
            );
            console.log(`[WEBHOOK] Transferred metadata to subscription ${session.subscription}`);
        } catch (err) {
            console.error('[WEBHOOK ERROR] Failed to transfer metadata to subscription:', err);
        }

        return;
    }
    // Prevent duplicate processing
    const existingTransaction = await CreditTransaction.findOne({
        'metadata.sessionId': session.id,
    });

    if (existingTransaction) {
        console.log(`[WEBHOOK] Duplicate transaction for session: ${session.id}`);
        return;
    }

    // Get the plan details
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
        console.error(`[WEBHOOK ERROR] Plan not found for ID: ${planId}`);
        return;
    }

    // Check if this is a subscription or one-time purchase
    if (metadata.type === 'subscription') {
        console.log('[WEBHOOK] Subscription checkout - Credits will be added via invoice webhook');
        return;
    }

    // PRIORITIZE METADATA VALUES
    const quantity = parseInt(metadata.quantity || '1');
    const totalCredits = parseInt(metadata.totalCredits || '0');

    // Validate credits calculation
    const calculatedCredits = plan.credits * quantity;
    const creditsToAdd = totalCredits > 0 ? totalCredits : calculatedCredits;

    console.log(`[WEBHOOK] Precise Credit Calculation:
        - Plan: ${plan.name}
        - Credits per Package: ${plan.credits}
        - Quantity: ${quantity}
        - Calculated Credits: ${calculatedCredits}
        - Metadata Total Credits: ${totalCredits}
        - Credits to Add: ${creditsToAdd}`);

    try {
        const transaction = await creditManager.addCredits(
            userId,
            creditsToAdd,
            `Purchased ${creditsToAdd} credits`,
            {
                sessionId: session.id,
                quantity: quantity,
                originalPlanCredits: plan.credits
            }
        );

        console.log(`[WEBHOOK] Transaction Created:`, transaction);
    } catch (error) {
        console.error('[WEBHOOK ERROR] Failed to add credits:', error);
    }
}
async function handleInvoicePaid(invoice) {
    console.log('Processing invoice.paid webhook');

    if (!invoice.subscription) {
        console.log('No subscription associated with this invoice');
        return;
    }

    try {
        // More robust duplicate check - check by invoice ID first
        const existingTransaction = await CreditTransaction.findOne({
            'metadata.invoiceId': invoice.id
        });

        if (existingTransaction) {
            console.log(`Duplicate invoice processing detected for invoice ID: ${invoice.id}`);
            return;
        }
        
        // Get the subscription
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        
        // Extract userId and planId from metadata or fallback to database
        let userId, planId;
        if (subscription.metadata && subscription.metadata.userId && subscription.metadata.planId) {
            userId = subscription.metadata.userId;
            planId = subscription.metadata.planId;
        } else {
            // Try to find the subscription in our database
            const user = await User.findOne({ 'subscription.stripeSubscriptionId': subscription.id });
            if (!user || !user.subscription || !user.subscription.planId) {
                console.error('Missing metadata in subscription and not found in database:', subscription.id);
                return;
            }
            
            userId = user._id;
            planId = user.subscription.planId;
            console.log(`Retrieved user ${userId} and plan ${planId} from database`);
        }

        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) {
            console.error('Plan not found for subscription:', subscription.id);
            return;
        }

        // Check if this is the first invoice or a renewal invoice
        const isFirstInvoice = invoice.billing_reason === 'subscription_create';
        const isRenewalInvoice = invoice.billing_reason === 'subscription_cycle';

        // Only process if it's the first invoice or a renewal invoice
        if (isFirstInvoice || isRenewalInvoice) {
            const user = await User.findById(userId).select('credits');
            const currentBalance = user.credits;

            // Expire unused credits only on renewal, not on first invoice
            if (!isFirstInvoice && currentBalance > 0) {
                await creditManager.expireCredits(
                    userId,
                    currentBalance,
                    `Unused credits expired on ${plan.name} plan renewal`,
                    {
                        invoiceId: invoice.id,
                        planName: plan.name
                    }
                );
            }

            // Add credits
            await creditManager.addCredits(
                userId,
                plan.credits,
                isFirstInvoice
                    ? `Initial ${plan.credits} credits from ${plan.name} subscription`
                    : `${plan.credits} credits from ${plan.name} subscription renewal`,
                {
                    invoiceId: invoice.id,
                    isFirstInvoice: isFirstInvoice,
                    planName: plan.name,
                    subscriptionId: subscription.id
                }
            );

            console.log(`Added ${plan.credits} credits for user ${userId} on ${isFirstInvoice ? 'first invoice' : 'renewal'}`);
        } else {
            console.log(`Skipping credit addition for invoice type: ${invoice.billing_reason}`);
        }

        // Update user's subscription details
        const nextRenewalDate = new Date(subscription.current_period_end * 1000);

        await User.findByIdAndUpdate(userId, {
            'subscription.nextRenewalDate': nextRenewalDate,
            'subscription.stripeSubscriptionId': subscription.id,
            'subscription.planId': planId,
            'subscription.status': subscription.status,
            'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
        });

        console.log(`Successfully processed invoice for user ${userId}, plan ${planId}`);
    } catch (error) {
        console.error('Error processing invoice.paid webhook:', error);
    }
}
// Handle subscription deletion (when canceled and period ends)
// Handle subscription deletion (when canceled and period ends)
async function handleSubscriptionDeleted(subscription) {
    console.log('Processing customer.subscription.deleted webhook');

    if (!subscription.metadata || !subscription.metadata.userId) {
        console.error('Missing userId in subscription metadata:', subscription.id);
        return;
    }

    const userId = subscription.metadata.userId;
    console.log(`Subscription ended for user ${userId}`);

    // Get the user and their current credits
    const user = await User.findById(userId);
    if (!user) {
        console.error(`User ${userId} not found when processing subscription deletion`);
        return;
    }

    // Expire any remaining credits since the subscription has ended
    if (user.credits > 0) {
        console.log(`Expiring ${user.credits} unused credits for user ${userId} due to subscription ending`);

        await creditManager.expireCredits(
            userId,
            user.credits,
            `Credits expired due to subscription ending`,
            { subscriptionId: subscription.id }
        );
    }

    // Update user record to remove subscription
    await User.findByIdAndUpdate(userId, {
        $unset: { subscription: "" }
    });

    console.log(`Subscription removed for user ${userId}`);
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
    console.log('Processing customer.subscription.updated webhook');

    if (!subscription.metadata || !subscription.metadata.userId) {
        // If we've already queued this subscription for retry, ignore this event
        if (pendingSubscriptionUpdates.has(subscription.id)) {
            console.log(`Subscription ${subscription.id} already queued for retry, skipping`);
            return;
        }

        console.log(`No metadata for subscription ${subscription.id}, will retry in 5 seconds`);

        // Queue this subscription for retry
        pendingSubscriptionUpdates.set(subscription.id, subscription);

        // Try again in 5 seconds
        setTimeout(async () => {
            console.log(`Retrying subscription update for ${subscription.id}`);
            try {
                // Fetch the latest subscription data
                const refreshedSubscription = await stripe.subscriptions.retrieve(subscription.id);

                // Remove from pending map
                pendingSubscriptionUpdates.delete(subscription.id);

                // Process with the refreshed data
                await handleSubscriptionUpdated(refreshedSubscription);
            } catch (error) {
                console.error(`Retry failed for subscription ${subscription.id}:`, error);
                pendingSubscriptionUpdates.delete(subscription.id);
            }
        }, 5000); // 5 second delay

        return;
    }

    const userId = subscription.metadata.userId;
    console.log(`Updating subscription status for user ${userId}: ${subscription.status}, cancelAtPeriodEnd: ${subscription.cancel_at_period_end}`);

    // Update user's subscription record
    await User.findByIdAndUpdate(userId, {
        'subscription.stripeSubscriptionId': subscription.id, // Make sure this is set
        'subscription.status': subscription.status,
        'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
        'subscription.nextRenewalDate': new Date(subscription.current_period_end * 1000)
    });
}

// Helper function to calculate next renewal date
function getNextRenewalDate(billingCycle) {
    const now = new Date();
    const nextRenewalDate = new Date(now);

    if (billingCycle === 'monthly') {
        nextRenewalDate.setMonth(now.getMonth() + 1);
    } else if (billingCycle === 'annual') {
        nextRenewalDate.setFullYear(now.getFullYear() + 1);
    }

    return nextRenewalDate;
}

module.exports = exports;