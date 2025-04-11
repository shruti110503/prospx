const express = require("express");
const { registerUser, loginUser, userDetail, googleUser, linkedinUser } = require("../controllers/authController");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

router.post("/signup", registerUser);
router.post("/login", loginUser);
router.get("/user", authMiddleware, userDetail);
router.post("/google", googleUser);
router.post("/linkedin", linkedinUser);

module.exports = router;