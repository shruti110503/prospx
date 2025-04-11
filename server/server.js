const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const creditRoutes = require("./routes/creditRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const contactListRoutes = require("./routes/contactListRoutes");
const personaRoutes = require("./routes/personaRoutes");
const extensionRoutes = require("./routes/extensionRoutes");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const compression = require("compression");

// Load environment variables (for local development)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// Validate required environment variables
const requiredEnvVars = ["MONGO_URI", "PORT"];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars.join(", "));
  process.exit(1);
}

// Connect to MongoDB using environment variable
connectDB(process.env.MONGO_URI);

const app = express();

// Azure deployment security and performance middleware
app.use(helmet());
app.use(compression());

// Configure CORS for Azure deployment
const allowedOrigins = [
  "https://prospx.io",
  "http://localhost:5173",
  `https://${process.env.AZURE_FRONTEND_URL}`, // Add your Azure frontend URL here
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Webhook endpoint for raw body handling
app.use("/api/subscriptions/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);

app.use(express.json());

// Configure static files for production
if (process.env.NODE_ENV === "production") {
  // Serve React frontend
  app.use(express.static(path.join(__dirname, "client/build")));

  // Handle React routing, return all requests to React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "client/build", "index.html"));
  });
}

// Ensure directories exist (Azure file system requirements)
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

// Configure file storage directories
const publicDirs = [
  path.join(__dirname, "public/avatars"),
  path.join(__dirname, "public/uploads")
];

publicDirs.forEach(ensureDirectoryExists);

// Serve static files
app.use("/avatars", express.static(path.join(__dirname, "public/avatars")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/contact-lists", contactListRoutes);
app.use("/api/personas", personaRoutes);
app.use("/api/extensions", extensionRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("🔥 Error:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});
