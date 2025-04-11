const express = require("express");
const { getCredits, getCreditHistory } = require("../controllers/creditController");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

router.get("/", authMiddleware, getCredits); // Get current credits
router.get("/history", authMiddleware, getCreditHistory); // Get credit transactions

module.exports = router;