// controllers/adminController.js
const User = require('../models/User');
const Testimonial = require('../models/Testimonial');
const SEO = require('../models/SEO');
const SiteSettings = require('../models/SiteSettings');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const CreditTransaction = require('../models/CreditTransaction');
const creditManager = require('../utils/creditManager');

// User Management
exports.getUsers = async (req, res) => {
  try {
    // Check if the user is an admin


    const users = await User.find().select('-password').populate('subscription.planId');
    return res.status(200).json(users);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    // Check if the user is an admin


    const user = await User.findById(req.params.id).select('-password').populate('subscription.planId');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
exports.updateUser = async (req, res) => {
  try {
    // Check if the user is an admin

    const {
      name,
      email,
      role,
      credits,
      verified,
      subscription
    } = req.body;

    // Find user by ID
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Track if subscription plan changed to know when to add credits
    let planChanged = false;
    let oldPlanId = null;
    let newPlanId = null;

    if (user.subscription && user.subscription.planId) {
      oldPlanId = user.subscription.planId.toString();
    }

    if (subscription && subscription.planId) {
      newPlanId = subscription.planId.toString();

      // Check if plan changed
      if (oldPlanId !== newPlanId) {
        planChanged = true;
      }
    } else if (subscription && subscription.planId === null && oldPlanId) {
      // Plan was removed
      planChanged = true;
    }

    // Update basic fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (credits !== undefined) user.credits = credits;
    if (verified !== undefined) user.verified = verified;

    // Handle subscription update if provided
    if (subscription) {
      // If subscription contains planId, update or create the subscription
      if (subscription.planId) {
        // Check if the plan exists
        const plan = await SubscriptionPlan.findById(subscription.planId);
        if (!plan) {
          return res.status(404).json({ message: 'Subscription plan not found' });
        }

        // Initialize subscription object if it doesn't exist
        if (!user.subscription) {
          user.subscription = {};
        }

        // Update subscription fields
        user.subscription.planId = subscription.planId;
        user.subscription.status = subscription.status || 'active';

        // Handle dates with proper validation
        if (subscription.startDate) {
          user.subscription.startDate = new Date(subscription.startDate);
        } else if (!user.subscription.startDate) {
          user.subscription.startDate = new Date();
        }

        if (subscription.nextRenewalDate) {
          user.subscription.nextRenewalDate = new Date(subscription.nextRenewalDate);
        } else if (!user.subscription.nextRenewalDate) {
          // Calculate next renewal date based on plan billing cycle if not provided
          const now = new Date();
          const nextRenewalDate = new Date(now);

          if (plan.billingCycle === 'monthly') {
            nextRenewalDate.setMonth(now.getMonth() + 1);
          } else if (plan.billingCycle === 'annual') {
            nextRenewalDate.setFullYear(now.getFullYear() + 1);
          }

          user.subscription.nextRenewalDate = nextRenewalDate;
        }

        // Update cancelAtPeriodEnd if provided
        if (subscription.cancelAtPeriodEnd !== undefined) {
          user.subscription.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
        }

        // Update Stripe subscription ID if provided
        if (subscription.stripeSubscriptionId) {
          user.subscription.stripeSubscriptionId = subscription.stripeSubscriptionId;
        }

        // If plan changed, we need to add the credits from the new plan
        if (planChanged) {
          // Store the plan to add credits after saving the user
          planToAddCredits = plan;
        }
      } else if (subscription.planId === null) {
        // If planId is explicitly set to null, remove the subscription
        user.subscription = undefined;
      }
    }

    await user.save();

    // Add credits if the plan changed
    if (planChanged && subscription && subscription.planId) {
      const plan = await SubscriptionPlan.findById(subscription.planId);

      if (plan && plan.credits > 0) {
        // If old plan exists, expire the old credits first
        if (oldPlanId && user.credits > 0) {
          try {
            await creditManager.expireCredits(
              user._id,
              user.credits,
              `Credits expired due to subscription plan change`
            );
          } catch (creditError) {
            console.error('Error expiring credits:', creditError);
            // Continue execution even if this fails
          }
        }
        console.log('Adding credits from plan:', plan);
        // Add new credits from the plan
        try {
          await creditManager.addCredits(
            user._id,
            plan.credits,
            `Credits added from ${plan.name} subscription plan (admin action)`
          );

          // Update user with new credit balance
          await user.save();
        } catch (creditError) {
          console.error('Error adding credits:', creditError);
          // Continue execution even if this fails
        }
      }

      // If the plan has a corresponding Stripe product/price and the user doesn't have a Stripe subscription ID
      // We could set up automatic billing here, but for admin-assigned plans, this is typically a manual process
      // For automatic renewals via Stripe, you would need to create a subscription in Stripe here

      // For plans with Stripe integration, you could set up a subscription:
      if (plan.stripePriceId && !user.subscription.stripeSubscriptionId && user.stripeCustomerId) {
        try {
          // Only create Stripe subscription if explicitly requested (optional)
          if (subscription.setupAutoRenewal) {
            const stripe = require('stripe')(config.stripSecretKey);

            // Create the subscription in Stripe
            const stripeSubscription = await stripe.subscriptions.create({
              customer: user.stripeCustomerId,
              items: [{ price: plan.stripePriceId }],
              metadata: {
                userId: user._id.toString(),
                planId: plan._id.toString()
              }
            });

            // Update the user with the Stripe subscription ID
            user.subscription.stripeSubscriptionId = stripeSubscription.id;
            await user.save();
          }
        } catch (stripeError) {
          console.error('Error creating Stripe subscription:', stripeError);
          // Continue execution even if this fails
        }
      }
    }

    // Populate subscription plan details for the response
    let populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('subscription.planId');

    return res.status(200).json({
      message: 'User updated successfully',
      user: populatedUser
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    // Check if the user is an admin


    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    // Check if the user is an admin


    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// Testimonial Management
exports.getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find().sort({ order: 1 });
    return res.status(200).json(testimonials);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addTestimonial = async (req, res) => {
  try {
    // Check if the user is an admin


    const { name, position, company, content, rating, imageUrl } = req.body;

    const testimonial = new Testimonial({
      name,
      position,
      company,
      content,
      rating: rating || 5,
      imageUrl
    });

    await testimonial.save();

    return res.status(201).json({
      message: 'Testimonial added successfully',
      testimonial
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateTestimonial = async (req, res) => {
  try {
    // Check if the user is an admin


    const { name, position, company, content, rating, imageUrl, isActive, order } = req.body;

    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    // Update fields if provided
    if (name) testimonial.name = name;
    if (position) testimonial.position = position;
    if (company) testimonial.company = company;
    if (content) testimonial.content = content;
    if (rating) testimonial.rating = rating;
    if (imageUrl) testimonial.imageUrl = imageUrl;
    if (isActive !== undefined) testimonial.isActive = isActive;
    if (order !== undefined) testimonial.order = order;

    await testimonial.save();

    return res.status(200).json({
      message: 'Testimonial updated successfully',
      testimonial
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteTestimonial = async (req, res) => {
  try {
    // Check if the user is an admin


    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    await Testimonial.findByIdAndDelete(req.params.id);

    return res.status(200).json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// SEO Management
exports.getSeoSettings = async (req, res) => {
  try {
    const { pageId } = req.params;

    const seo = await SEO.findOne({ pageId });

    if (!seo) {
      return res.status(404).json({ message: 'SEO settings not found' });
    }

    return res.status(200).json(seo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllSeoSettings = async (req, res) => {
  try {
    const seoSettings = await SEO.find();
    return res.status(200).json(seoSettings);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSeoSettings = async (req, res) => {
  try {
    // Check if the user is an admin


    const { pageId } = req.params;
    const { title, description, keywords, ogImage, canonical } = req.body;

    let seo = await SEO.findOne({ pageId });

    if (!seo) {
      // Create new SEO settings if they don't exist
      seo = new SEO({
        pageId,
        title,
        description,
        keywords: keywords || [],
        ogImage,
        canonical
      });
    } else {
      // Update existing SEO settings
      if (title) seo.title = title;
      if (description) seo.description = description;
      if (keywords) seo.keywords = keywords;
      if (ogImage) seo.ogImage = ogImage;
      if (canonical) seo.canonical = canonical;
    }

    await seo.save();

    return res.status(200).json({
      message: 'SEO settings updated successfully',
      seo
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Site Settings Management
exports.getSiteSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();

    if (!settings) {
      // Create default settings if none exist
      settings = new SiteSettings();
      await settings.save();
    }

    return res.status(200).json(settings);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSiteSettings = async (req, res) => {
  try {
    // Check if the user is an admin


    const {
      siteName,
      primaryColor,
      secondaryColor,
      contactEmail,
      contactPhone,
      address,
      socialLinks,
      googleAnalyticsId,
      isMaintenanceMode
    } = req.body;

    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = new SiteSettings();
    }

    // Update fields if provided
    if (siteName) settings.siteName = siteName;
    if (primaryColor) settings.primaryColor = primaryColor;
    if (secondaryColor) settings.secondaryColor = secondaryColor;
    if (contactEmail) settings.contactEmail = contactEmail;
    if (contactPhone) settings.contactPhone = contactPhone;
    if (address) settings.address = address;
    if (socialLinks) settings.socialLinks = {
      ...settings.socialLinks,
      ...socialLinks
    };
    if (googleAnalyticsId !== undefined) settings.googleAnalyticsId = googleAnalyticsId;
    if (isMaintenanceMode !== undefined) settings.isMaintenanceMode = isMaintenanceMode;

    await settings.save();

    return res.status(200).json({
      message: 'Site settings updated successfully',
      settings
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Logo Upload
exports.uploadLogo = async (req, res) => {
  try {
    // Check if the user is an admin


    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const settings = await SiteSettings.findOne();

    if (!settings) {
      return res.status(404).json({ message: 'Site settings not found' });
    }

    // Save file path
    settings.logo = `/uploads/${req.file.filename}`;
    await settings.save();

    return res.status(200).json({
      message: 'Logo uploaded successfully',
      logo: settings.logo
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Subscription Plan Management
exports.getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1 });
    return res.status(200).json(plans);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    return res.status(200).json(plan);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.createSubscriptionPlan = async (req, res) => {
  try {
    // Check if the user is an admin


    const {
      name,
      description,
      price,
      billingCycle,
      credits,
      enrichmentsPerMonth,
      features,
      stripePriceId,
      stripeProductId,
      displayOnWebsite,
      sortOrder,
      active
    } = req.body;

    const plan = new SubscriptionPlan({
      name,
      description,
      price,
      billingCycle,
      credits,
      enrichmentsPerMonth: enrichmentsPerMonth || 0,
      features: features || [],
      stripePriceId,
      stripeProductId,
      displayOnWebsite: displayOnWebsite !== undefined ? displayOnWebsite : true,
      sortOrder: sortOrder || 999,
      active: active !== undefined ? active : true
    });

    await plan.save();

    return res.status(201).json({
      message: 'Subscription plan created successfully',
      plan
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSubscriptionPlan = async (req, res) => {
  try {
    // Check if the user is an admin


    const {
      name,
      description,
      price,
      billingCycle,
      credits,
      enrichmentsPerMonth,
      features,
      stripePriceId,
      stripeProductId,
      displayOnWebsite,
      sortOrder,
      active
    } = req.body;

    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Update fields if provided
    if (name) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (price !== undefined) plan.price = price;
    if (billingCycle) plan.billingCycle = billingCycle;
    if (credits !== undefined) plan.credits = credits;
    if (enrichmentsPerMonth !== undefined) plan.enrichmentsPerMonth = enrichmentsPerMonth;
    if (features) plan.features = features;
    if (stripePriceId) plan.stripePriceId = stripePriceId;
    if (stripeProductId) plan.stripeProductId = stripeProductId;
    if (displayOnWebsite !== undefined) plan.displayOnWebsite = displayOnWebsite;
    if (sortOrder !== undefined) plan.sortOrder = sortOrder;
    if (active !== undefined) plan.active = active;

    await plan.save();

    return res.status(200).json({
      message: 'Subscription plan updated successfully',
      plan
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteSubscriptionPlan = async (req, res) => {
  try {
    // Check if the user is an admin


    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Check if any users are using this plan
    const usersWithPlan = await User.countDocuments({ 'subscription.planId': plan._id });

    if (usersWithPlan > 0) {
      return res.status(400).json({
        message: 'Cannot delete plan that is being used by users',
        usersCount: usersWithPlan
      });
    }

    await SubscriptionPlan.findByIdAndDelete(req.params.id);

    return res.status(200).json({ message: 'Subscription plan deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Dashboard Overview
exports.getDashboardStats = async (req, res) => {
  try {
    console.log(req.user);
    // Check if the user is an admin


    // Get user counts
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({ 'subscription.status': 'active' });

    // Get plan distribution
    const plans = await SubscriptionPlan.find();

    const planDistribution = await Promise.all(
      plans.map(async (plan) => {
        const count = await User.countDocuments({ 'subscription.planId': plan._id });
        return {
          planName: plan.name,
          count
        };
      })
    );

    // Get recent users
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt');

    return res.status(200).json({
      totalUsers,
      activeSubscriptions,
      planDistribution,
      recentUsers
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};