// routes/subscriptionRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');

// Public routes
router.get('/plans', subscriptionController.getSubscriptionPlans);

// Protected routes - require authentication
router.get('/credits', authMiddleware, subscriptionController.getUserCreditInfo);
router.get('/additional-credits', authMiddleware, subscriptionController.getAdditionalCreditsPlan);

// Payment routes
router.post('/create-checkout', authMiddleware, subscriptionController.createCheckoutSession);
router.post('/purchase-credits', authMiddleware, subscriptionController.purchaseCredits);
router.post('/subscribe', authMiddleware, subscriptionController.subscribeToPlan);
router.post('/cancel', authMiddleware, subscriptionController.cancelSubscription);

// Stripe webhook - this needs to be a raw body parser for Stripe signature verification
router.post('/webhook', 
    express.raw({ type: 'application/json' }), 
    subscriptionController.handleStripeWebhook
);

module.exports = router;