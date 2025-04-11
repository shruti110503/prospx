const express = require("express");
const router = express.Router();
const contactListController = require("../controllers/contactListController");
const authMiddleware = require("../middleware/authMiddleware");

// Contact List routes
router.post("/", authMiddleware, contactListController.createContactList);
router.put("/:contactListId", authMiddleware, contactListController.updateContactListName);
router.delete("/:contactListId", authMiddleware, contactListController.deleteContactList);
router.get("/", authMiddleware, contactListController.getUserContactLists);

// Contact management within lists
router.post("/:contactListId/contacts", authMiddleware, contactListController.addContactToList);
router.get("/:contactListId/contacts", authMiddleware, contactListController.getContactsFromList);
router.put("/contacts/:contactId", authMiddleware, contactListController.updateContactInList);
router.delete("/:contactListId/contacts/:contactId", authMiddleware, contactListController.deleteContactFromList);

// NEW: Bulk contact handling
router.post("/:contactListId/bulk-contacts", authMiddleware, contactListController.addBulkContactsToList);

// NEW: Find contact information endpoints
router.get("/contacts/:contactId/find-phone", authMiddleware, contactListController.findContactPhone);
router.get("/contacts/:contactId/find-email", authMiddleware, contactListController.findContactEmail);
router.post("/:contactListId/find-numbers", authMiddleware, contactListController.findBulkPhones);
router.post("/:contactListId/find-emails", authMiddleware, contactListController.findBulkEmails);

// find email and phone from linkedin URL 
router.post("/find-phone", authMiddleware, contactListController.findPhoneByLinkedIn);

// NEW: Additional email finding endpoint
router.post("/find-email", authMiddleware, contactListController.findEmailByLinkedIn);


module.exports = router;