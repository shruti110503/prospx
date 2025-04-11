const express = require("express");
const router = express.Router();
const personaController = require("../controllers/personaController");
const authMiddleware = require("../middleware/authMiddleware");


router.post("/", authMiddleware, personaController.createPersona);
router.put("/:personaId", authMiddleware, personaController.updatePersona);
router.delete("/:personaId", authMiddleware, personaController.deletePersona);
router.get("/", authMiddleware, personaController.getUserPersonas);
router.post('/update-prompt', authMiddleware, personaController.updatePrompt);
router.post('/launch-sales-navigator', authMiddleware, personaController.launchSalesNavigator);
router.post('/generate-filters', authMiddleware, personaController.generateFilters);

module.exports = router;