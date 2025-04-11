const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const mongoose = require('mongoose');

exports.CREDIT_COSTS = {
    EMAIL_SEARCH: 2,
    PHONE_SEARCH: 10,
};

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 50; // ms

async function executeWithRetry(operation) {
    let retries = 0;
    while (true) {
        try {
            return await operation();
        } catch (error) {
            if (error.code === 112 && retries < MAX_RETRIES) {
                retries++;
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, retries);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

exports.addCredits = async (userId, amount, description, metadata = {}) => {
    return executeWithRetry(async () => {
        // Check if a transaction with the same metadata already exists
       
        const session = await mongoose.startSession();
        session.startTransaction();
            
        try {
            const user = await User.findById(userId).session(session);
            if (!user) throw new Error('User not found');

            user.credits += amount;
            await user.save({ session });

            const transaction = new CreditTransaction({
                user: user._id,
                amount,
                type: 'add',
                description,
                reason: description,
                balanceAfter: user.credits,
                metadata,
                date: new Date(),
            });

            await transaction.save({ session });
            await session.commitTransaction();

            return transaction;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    });
};


exports.useCredits = async (userId, operation, description, metadata = {}) => {
    return executeWithRetry(async () => {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const user = await User.findById(userId).session(session);
            if (!user) {
                throw new Error('User not found');
            }

            let amount = operation;
            if (typeof operation === 'string' && exports.CREDIT_COSTS[operation]) {
                amount = exports.CREDIT_COSTS[operation];
            }

            if (user.credits < amount) {
                throw new Error('Not enough credits');
            }

            user.credits -= amount;
            await user.save({ session });

            const transaction = new CreditTransaction({
                user: userId,
                amount: -amount,
                type: 'use',
                description,
                reason: description,
                balanceAfter: user.credits,
                metadata,
                date: new Date()
            });

            await transaction.save({ session });
            await session.commitTransaction();

            return transaction;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    });
};

exports.debitCredits = exports.useCredits;

exports.expireCredits = async (userId, amount, description, metadata = {}) => {
    return executeWithRetry(async () => {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const user = await User.findById(userId).session(session);
            if (!user) {
                throw new Error('User not found');
            }

            const amountToExpire = Math.min(user.credits, amount);

            if (amountToExpire > 0) {
                user.credits -= amountToExpire;
                await user.save({ session });

                const transaction = new CreditTransaction({
                    user: userId,
                    amount: -amountToExpire,
                    type: 'expire',
                    description,
                    reason: description,
                    balanceAfter: user.credits,
                    metadata,
                    date: new Date()
                });

                await transaction.save({ session });
                await session.commitTransaction();

                return transaction;
            }

            await session.commitTransaction();
            return null;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    });
};

exports.hasSufficientCredits = async (userId, operation) => {
    const user = await User.findById(userId).select('credits');
    if (!user) {
        throw new Error('User not found');
    }

    const requiredCredits = exports.CREDIT_COSTS[operation] || 0;
    if (requiredCredits === 0) {
        console.warn(`Operation ${operation} has no defined credit cost`);
    }

    return user.credits >= requiredCredits;
};

exports.hasEnoughCredits = async (userId, amount) => {
    const user = await User.findById(userId).select('credits');
    if (!user) {
        throw new Error('User not found');
    }

    return user.credits >= amount;
};

exports.getCreditBalance = async (userId) => {
    const user = await User.findById(userId).select('credits');
    if (!user) {
        throw new Error('User not found');
    }

    return user.credits;
};

exports.getCreditHistory = async (userId, options = {}) => {
    const { limit = 50, skip = 0, type } = options;

    const query = { user: userId };
    if (type) {
        query.type = type;
    }

    return CreditTransaction.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit);
};

module.exports = exports;
