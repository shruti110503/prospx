const CreditTransaction = require("../models/CreditTransaction");
const User = require("../models/User");

const getCredits = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        res.json({ credits: user.credits });
    } catch (error) {
        res.status(500).json({ message: "Error fetching credits", error });
    }
};

const getCreditHistory = async (req, res) => {
    try {
        const transactions = await CreditTransaction.find({ user: req.user.userId }).sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: "Error fetching credit history", error });
    }
};

module.exports = { getCredits, getCreditHistory };
