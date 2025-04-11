// routes/adminRoutes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  resetUserPassword,
  getTestimonials,
  addTestimonial,
  updateTestimonial,
  deleteTestimonial,
  getSeoSettings,
  getAllSeoSettings,
  updateSeoSettings,
  getSiteSettings,
  updateSiteSettings,
  uploadLogo,
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getDashboardStats
} = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads');

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'site-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Dashboard stats
router.get("/dashboard-stats", authMiddleware, getDashboardStats);

// User management routes
router.get("/users", authMiddleware, getUsers);
router.get("/users/:id", authMiddleware, getUserById);
router.put("/users/:id", authMiddleware, updateUser);
router.delete("/users/:id", authMiddleware, deleteUser);
router.post("/users/:id/reset-password", authMiddleware, resetUserPassword);

// Testimonial management routes
router.get("/testimonials", getTestimonials);
router.post("/testimonials", authMiddleware, addTestimonial);
router.put("/testimonials/:id", authMiddleware, updateTestimonial);
router.delete("/testimonials/:id", authMiddleware, deleteTestimonial);

// SEO management routes
router.get("/seo",  getAllSeoSettings);
router.get("/seo/:pageId",  getSeoSettings);
router.put("/seo/:pageId", authMiddleware, updateSeoSettings);

// Site settings routes
router.get("/site-settings", getSiteSettings);
router.put("/site-settings", authMiddleware, updateSiteSettings);
router.post("/upload-logo", authMiddleware, upload.single('logo'), uploadLogo);

// Subscription plan routes
router.get("/subscription-plans", getSubscriptionPlans);
router.get("/subscription-plans/:id", getSubscriptionPlan);
router.post("/subscription-plans", authMiddleware, createSubscriptionPlan);
router.put("/subscription-plans/:id", authMiddleware, updateSubscriptionPlan);
router.delete("/subscription-plans/:id", authMiddleware, deleteSubscriptionPlan);

module.exports = router;