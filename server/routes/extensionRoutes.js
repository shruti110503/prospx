const express = require("express");
const router = express.Router();
const extensionsController = require("../controllers/extensionsController");
const authMiddleware = require("../middleware/authMiddleware");

// Proxy route for Anthropic API
router.post("/proxy/anthropic", authMiddleware, extensionsController.proxyAnthropicAPI);

// Add your other routes here

module.exports = router;