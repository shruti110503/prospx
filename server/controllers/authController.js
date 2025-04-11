const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const CreditTransaction = require("../models/CreditTransaction");
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const config = require('../config'); // Import the configuration handler

// Initialize the Google OAuth client with the client ID from config
const client = new OAuth2Client(config.googleClientId);

// Helper function to generate avatar (if you have this function)
const generateAvatar = (initials) => {
    // If you have an implementation, use it, otherwise return null
    return null;
};

// Helper function for calculating next renewal date
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

// Updated registerUser function
const registerUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: "User already exists" });

        // Extract first letter and last letter before @ for initials
        const firstChar = email.charAt(0).toUpperCase();
        const atIndex = email.indexOf('@');
        const lastChar = atIndex > 1 ? email.charAt(atIndex - 1).toUpperCase() : '';
        const initials = `${firstChar}${lastChar}`;

        // Find the default subscription plan (free plan)
        const defaultPlan = await SubscriptionPlan.findOne({ price: 0 });
        const initialCredits = defaultPlan ? defaultPlan.credits : 0;
        const nextRenewalDate = getNextRenewalDate(defaultPlan.billingCycle);

        // Create the user with a properly structured subscription object
        user = new User({
            email,
            password, // Pass the raw password, let the model's pre-save hook handle hashing
            credits: initialCredits,
            authProvider: "local",
            name: email.split('@')[0], // Default name from email
            subscription: {
                planId: defaultPlan._id,
                status: 'active',
                startDate: new Date(),
                nextRenewalDate: nextRenewalDate,
                // For free plans, we don't have a stripeSubscriptionId, 
                // but set cancelAtPeriodEnd to false explicitly
                cancelAtPeriodEnd: false
            }
        });

        await user.save();

        // Log the credit transaction for transparency
        if (defaultPlan) {
            await CreditTransaction.create({
                user: user._id,
                amount: initialCredits,
                reason: `Assigned default plan: ${defaultPlan.name}`,
                type: 'add',
                balanceAfter: initialCredits
            });
        }

        res.status(201).json({
            message: "User registered successfully",
            user: {
                email: user.email,
                profilePic: user.profilePic,
                credits: user.credits
            }
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: "Error registering user", error: error.message });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        if (user.authProvider !== "local") {
            return res.status(401).json({
                message: "This account was created using " + user.authProvider + ". Please login with " + user.authProvider + " instead."
            });
        }

        // Use JWT secret from config
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            config.jwtSecret,
            { expiresIn: "7d" }
        );

        res.json({
            token,
            user: {
                email: user.email,
                name: user.name,
                credits: user.credits,
                role: user.role,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
};

const userDetail = async (req, res) => {
    try {
        var user = await User.findById(req.user.userId)
            .select("-password")
            .populate("contactLists", "name _id")
            .populate("personas", "name _id description");

        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ message: "Error fetching user details", error: error.message });
    }
};

// Updated Google authentication function
const googleUser = async (req, res) => {
    try {
        const { tokenId } = req.body;

        if (!tokenId) {
            return res.status(400).json({ message: "ID token is required" });
        }

        // Verify the Google token using client ID from config
        const ticket = await client.verifyIdToken({
            idToken: tokenId,
            audience: config.googleClientId
        });

        const payload = ticket.getPayload();
        const { email_verified, email, name, picture } = payload;

        // Check if email is verified
        if (!email_verified) {
            return res.status(400).json({ message: "Email not verified with Google" });
        }

        // Check if user already exists
        let user = await User.findOne({ email });
        if (!user) {
            // Find the default subscription plan
            const defaultPlan = await SubscriptionPlan.findOne({ price: 0 });
            const initialCredits = defaultPlan ? defaultPlan.credits : 0;
            const nextRenewalDate = getNextRenewalDate(defaultPlan.billingCycle);

            // Generate random password for the user since it's required by your model
            const randomPassword = Math.random().toString(36).slice(-10);

            // Use Google profile picture or generate avatar
            let profilePic = picture;
            if (!profilePic) {
                const firstChar = email.charAt(0).toUpperCase();
                const atIndex = email.indexOf('@');
                const lastChar = atIndex > 1 ? email.charAt(atIndex - 1).toUpperCase() : '';
                const initials = `${firstChar}${lastChar}`;
                profilePic = generateAvatar(initials);
            }

            // Create new user with proper subscription structure
            user = new User({
                email,
                name: name || email.split('@')[0],
                password: randomPassword, // Pass raw password, let model hash it
                profilePic,
                credits: initialCredits,
                authProvider: "google",
                subscription: {
                    planId: defaultPlan._id,
                    status: 'active',
                    startDate: new Date(),
                    nextRenewalDate: nextRenewalDate,
                    cancelAtPeriodEnd: false
                }
            });

            await user.save();

            // Log the credit transaction
            if (defaultPlan) {
                await CreditTransaction.create({
                    user: user._id,
                    amount: initialCredits,
                    reason: `Assigned default plan: ${defaultPlan.name}`,
                    type: 'add',
                    balanceAfter: initialCredits
                });
            }
        } else if (user.authProvider !== "google") {
            // If user exists but didn't sign up with Google before
            user.authProvider = "google";
            if (name && !user.name) user.name = name;
            if (picture && !user.profilePic) user.profilePic = picture;
            await user.save();
        }

        // Generate JWT token using secret from config
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            config.jwtSecret,
            { expiresIn: "7d" }
        );

        // Return user info and token
        res.status(200).json({
            token,
            user: {
                email: user.email,
                name: user.name,
                credits: user.credits,
                role: user.role,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        console.error("Google Authentication Error:", error);
        res.status(500).json({ message: "Authentication failed", error: error.message });
    }
};

// Updated LinkedIn authentication function
const linkedinUser = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ message: "Authorization code is required" });
        }

        console.log("LinkedIn auth code received:", code);
        // Exchange authorization code for access token using config values
        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.linkedinRedirectUri,
                client_id: config.linkedinClientId,
                client_secret: config.linkedinClientSecret
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log("LinkedIn token response received");

        const accessToken = tokenResponse.data.access_token;

        // Get user profile data using the userinfo endpoint
        const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const { email, given_name, family_name, name, picture } = profileResponse.data;

        if (!email) {
            return res.status(400).json({ message: "Email not provided by LinkedIn" });
        }

        // Check if user already exists
        let user = await User.findOne({ email });

        if (!user) {
            // Find the default subscription plan
            const defaultPlan = await SubscriptionPlan.findOne({ price: 0 });
            const initialCredits = defaultPlan ? defaultPlan.credits : 0;
            const nextRenewalDate = getNextRenewalDate(defaultPlan.billingCycle);

            // Generate random password for the user since it's required by your model
            const randomPassword = Math.random().toString(36).slice(-10);

            // Use profile picture from LinkedIn or generate avatar
            let profilePic = picture;
            if (!profilePic) {
                const firstChar = given_name ? given_name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
                const lastChar = family_name ? family_name.charAt(0).toUpperCase() : '';
                const initials = `${firstChar}${lastChar}`;
                profilePic = generateAvatar(initials);
            }

            // Create new user with proper subscription structure
            user = new User({
                email,
                name: name || `${given_name || ''} ${family_name || ''}`.trim() || email.split('@')[0],
                password: randomPassword, // Pass raw password, let model hash it
                profilePic,
                credits: initialCredits,
                authProvider: "linkedin",
                subscription: {
                    planId: defaultPlan._id,
                    status: 'active',
                    startDate: new Date(),
                    nextRenewalDate: nextRenewalDate,
                    cancelAtPeriodEnd: false
                }
            });

            await user.save();

            // Log the credit transaction
            if (defaultPlan) {
                await CreditTransaction.create({
                    user: user._id,
                    amount: initialCredits,
                    reason: `Assigned default plan: ${defaultPlan.name}`,
                    type: 'add',
                    balanceAfter: initialCredits
                });
            }
        } else if (user.authProvider !== "linkedin") {
            // If user exists but didn't sign up with LinkedIn before
            user.authProvider = "linkedin";
            if (name && !user.name) user.name = name;
            if (picture && !user.profilePic) user.profilePic = picture;
            await user.save();
        }

        // Generate JWT token using secret from config
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            config.jwtSecret,
            { expiresIn: "7d" }
        );

        // Return user info and token
        res.status(200).json({
            token,
            user: {
                email: user.email,
                name: user.name,
                credits: user.credits,
                role: user.role,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        console.error("LinkedIn Authentication Error:", error.response?.data || error.message);

        // Improved error logging
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            console.error("Headers:", error.response.headers);
        } else if (error.request) {
            console.error("Request was made but no response received");
            console.error(error.request);
        } else {
            console.error("Error setting up request:", error.message);
        }

        res.status(500).json({
            message: "Authentication failed",
            error: error.response?.data || error.message
        });
    }
};

module.exports = { registerUser, loginUser, userDetail, googleUser, linkedinUser };