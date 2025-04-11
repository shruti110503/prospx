const axios = require("axios");
const config = require("../config"); // Import the configuration handler

// Proxy function for Anthropic API
exports.proxyAnthropicAPI = async (req, res) => {
    try {
        const { body } = req;
        // Use the API key from config instead of directly from process.env
        const apiKey = config.anthropicApiKey || req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(400).json({ success: false, message: "No API key provided" });
        }

        const response = await axios.post('https://api.anthropic.com/v1/messages', body, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        return res.status(200).json(response.data);
    } catch (error) {
        console.error("Anthropic API proxy error:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.error?.message || "Error processing request",
            error: error.response?.data || error.message
        });
    }
};