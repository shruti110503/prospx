const jwt = require("jsonwebtoken");
const config = require("../config"); // Import the configuration handler

const authMiddleware = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(401).json({ message: "Access denied" });
    try {
        // Use JWT secret from config instead of directly from process.env
        const decoded = jwt.verify(token.replace("Bearer ", ""), config.jwtSecret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authMiddleware;