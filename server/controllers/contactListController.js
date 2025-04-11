const ContactList = require("../models/ContactList");
const Contact = require("../models/Contact");
const User = require("../models/User");
const ApolloContact = require("../models/ApolloContact");
const axios = require("axios");
const config = require("../config"); // Import the configuration handler
const creditManager = require('../utils/creditManager');

// Updated to match Redux slice expectations
exports.createContactList = async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.userId;

        const contactList = new ContactList({ name, createdAt: new Date(), contacts: [] });
        await contactList.save();

        // Add contact list reference to user
        await User.findByIdAndUpdate(userId, { $push: { contactLists: contactList._id } });

        // Return format matched to Redux slice expectation
        res.status(201).json({
            message: "Contact List created successfully",
            contactList // This is what the Redux slice expects for createContactList.fulfilled
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Updated to match Redux slice expectations
exports.updateContactListName = async (req, res) => {
    try {
        const { contactListId } = req.params;
        const { name } = req.body;

        const contactList = await ContactList.findByIdAndUpdate(contactListId, { name }, { new: true });

        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Return format matched to Redux slice expectation
        res.json({
            message: "Contact List updated successfully",
            contactList // This is what the Redux slice expects for updateContactList.fulfilled
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteContactList = async (req, res) => {
    try {
        const { contactListId } = req.params;
        const userId = req.user.userId;

        const contactList = await ContactList.findByIdAndDelete(contactListId);
        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Remove from User's ContactLists
        await User.findByIdAndUpdate(userId, { $pull: { contactLists: contactListId } });

        // Return format matched to Redux slice expectation (just success message as the slice uses contactListId from params)
        res.json({ message: "Contact List deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Updated to match Redux slice expectations
exports.getUserContactLists = async (req, res) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(400).json({ error: "User ID is missing from request" });
        }

        const userId = req.user.userId;
        const user = await User.findById(userId).populate("contactLists");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Return format matched to Redux slice expectation
        res.json({
            lists: user.contactLists // This is what the Redux slice expects for fetchContactLists.fulfilled
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Updated to match Redux slice expectations
exports.addContactToList = async (req, res) => {
    try {
        const { contactListId } = req.params;
        const {
            name,
            email,
            linkedinUrl,
            position,
            company,
            location,
            industry,
            notes,
            tags,
            avatar,
            personaRelation,
            about,
            connections
        } = req.body;

        // Create new contact with all available fields
        const newContact = new Contact({
            name,
            email,
            linkedinUrl,
            position,
            company,
            location: location || "",
            industry: industry || "",
            notes: notes || "",
            tags: tags || [],
            avatar: avatar || "",
            personaRelation: personaRelation || "",
            about: about || "",
            connections: connections || "",
            addedAt: new Date()
        });

        await newContact.save();

        // If contact has LinkedIn URL, check or create entry in ApolloContact
        if (linkedinUrl) {
            await getOrCreateApolloContact(linkedinUrl, email);
        }

        // Add contact reference to Contact List
        const contactList = await ContactList.findByIdAndUpdate(
            contactListId,
            { $push: { contacts: newContact._id } },
            { new: true }
        ).populate("contacts");

        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Return format matched to Redux slice expectation
        res.status(201).json({
            message: "Contact added successfully",
            contact: newContact, // This is what the Redux slice expects for createContact.fulfilled
            listId: contactListId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Updated to match Redux slice expectations
exports.updateContactInList = async (req, res) => {
    try {
        const { contactId } = req.params;
        const {
            name,
            email,
            linkedinUrl,
            position,
            company,
            location,
            industry,
            notes,
            tags,
            phone,
            avatar,
            personaRelation,
            about,
            connections
        } = req.body;

        const updatedContact = await Contact.findByIdAndUpdate(
            contactId,
            {
                name,
                email,
                linkedinUrl,
                position,
                company,
                location,
                industry,
                notes,
                tags,
                phone,
                avatar,
                personaRelation,
                about,
                connections,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!updatedContact) {
            return res.status(404).json({ message: "Contact not found" });
        }

        // If contact has LinkedIn URL and email/phone updated, update Apollo cache
        if (linkedinUrl) {
            if (email || phone) {
                await updateApolloContactCache(linkedinUrl, { email, phone });
            }
        }

        // Return format matched to Redux slice expectation
        res.json({
            message: "Contact updated successfully",
            contact: updatedContact // This is what the Redux slice expects for updateContact.fulfilled
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteContactFromList = async (req, res) => {
    try {
        const { contactListId, contactId } = req.params;

        const contactList = await ContactList.findByIdAndUpdate(
            contactListId,
            { $pull: { contacts: contactId } },
            { new: true }
        );

        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Delete contact from database
        await Contact.findByIdAndDelete(contactId);

        // Return format matches Redux slice expectation (the slice uses listId and contactId from the request)
        res.json({ message: "Contact deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Updated to match Redux slice expectations
exports.getContactsFromList = async (req, res) => {
    try {
        const { contactListId } = req.params;

        const contactList = await ContactList.findById(contactListId).populate("contacts");

        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Return format matched to Redux slice expectation
        res.json({
            contacts: contactList.contacts // This is what the Redux slice expects for fetchContacts.fulfilled
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.addBulkContactsToList = async (req, res) => {
    try {
        const { contactListId } = req.params;
        const { contacts } = req.body;

        if (!Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ message: "Invalid or empty contacts array" });
        }

        // Check if contact list exists
        const contactList = await ContactList.findById(contactListId);
        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Process each contact
        const contactIds = [];
        const results = {
            added: 0,
            skipped: 0,
            errors: []
        };

        for (const contactData of contacts) {
            try {
                // Check if contact with same LinkedIn URL already exists
                let existingContact = null;
                if (contactData.linkedinUrl) {
                    existingContact = await Contact.findOne({ linkedinUrl: contactData.linkedinUrl });
                }

                if (existingContact) {
                    // Skip duplicates
                    results.skipped++;
                    continue;
                }

                // Create new contact
                const newContact = new Contact({
                    name: contactData.name || "Unknown",
                    email: contactData.email || "",
                    linkedinUrl: contactData.linkedinUrl || "",
                    position: contactData.position || "",
                    company: contactData.company || "",
                    location: contactData.location || "",
                    industry: contactData.industry || "",
                    notes: contactData.notes || "",
                    tags: contactData.tags || [],
                    addedAt: new Date()
                });

                await newContact.save();
                contactIds.push(newContact._id);
                results.added++;

                // Add to Apollo contact cache if LinkedIn URL present
                if (contactData.linkedinUrl) {
                    await getOrCreateApolloContact(contactData.linkedinUrl, contactData.email);
                }
            } catch (error) {
                console.error("Error adding contact:", error);
                results.errors.push({
                    name: contactData.name || "Unknown",
                    error: error.message
                });
            }
        }

        // Add all successful contacts to the contact list
        if (contactIds.length > 0) {
            await ContactList.findByIdAndUpdate(
                contactListId,
                { $push: { contacts: { $each: contactIds } } }
            );
        }

        // Get the updated contact list
        const updatedContactList = await ContactList.findById(contactListId).populate("contacts");

        res.status(201).json({
            message: `Added ${results.added} contacts. Skipped ${results.skipped} duplicates.`,
            results,
            contactList: updatedContactList // Include the updated list for Redux to use
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// The rest of the file remains unchanged as these functions don't directly affect the Redux slice

exports.findContactPhone = async (req, res) => {
    console.log("Finding phone for contact");
    try {
        const { contactId } = req.params;
        const userId = req.user.userId;

        // First check if user has sufficient credits
        const hasSufficientCredits = await creditManager.hasSufficientCredits(userId, 'PHONE_SEARCH');
        if (!hasSufficientCredits) {
            return res.status(402).json({
                message: "Insufficient credits. Please purchase more credits to continue.",
                creditCost: creditManager.CREDIT_COSTS.PHONE_SEARCH
            });
        }

        // Find the contact to get LinkedIn URL
        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }

        if (!contact.linkedinUrl) {
            return res.status(400).json({ message: "Contact does not have a LinkedIn URL" });
        }

        // Try to get phone from cache or Apollo API
        const { phone, fromCache } = await getContactPhone(contact.linkedinUrl);

        if (phone) {
            // Update contact with phone
            const updatedContact = await Contact.findByIdAndUpdate(
                contactId,
                { phone },
                { new: true }
            );

            // Debit credits regardless of cache or API source
            await creditManager.debitCredits(
                userId,
                'PHONE_SEARCH',
                `LinkedIn: ${contact.linkedinUrl.substring(0, 30)}...`
            );

            res.json({
                message: `Phone number ${fromCache ? "found in cache" : "fetched from Apollo"} and updated`,
                contact: updatedContact,
                fromCache,
                creditCost: creditManager.CREDIT_COSTS.PHONE_SEARCH
            });
        } else {
            return res.status(404).json({ message: "Phone number not found" });
        }

    } catch (error) {
        console.error("Error finding phone:", error);

        // Enhanced error logging
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding phone number",
            details: error.response?.data || "No additional details available"
        });
    }
};

exports.findContactEmail = async (req, res) => {
    console.log("Finding email for contact");
    try {
        const { contactId } = req.params;
        const userId = req.user.userId;

        // First check if user has sufficient credits
        const hasSufficientCredits = await creditManager.hasSufficientCredits(userId, 'EMAIL_SEARCH');
        if (!hasSufficientCredits) {
            return res.status(402).json({
                message: "Insufficient credits. Please purchase more credits to continue.",
                creditCost: creditManager.CREDIT_COSTS.EMAIL_SEARCH
            });
        }

        // Find the contact to get LinkedIn URL
        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }

        if (!contact.linkedinUrl) {
            return res.status(400).json({ message: "Contact does not have a LinkedIn URL" });
        }

        // Try to get email from cache or Apollo API
        const { email, fromCache } = await getContactEmail(contact.linkedinUrl);

        if (email) {
            // Update contact with email
            const updatedContact = await Contact.findByIdAndUpdate(
                contactId,
                { email },
                { new: true }
            );

            // Debit credits regardless of cache or API source
            await creditManager.debitCredits(
                userId,
                'EMAIL_SEARCH',
                `LinkedIn: ${contact.linkedinUrl.substring(0, 30)}...`
            );

            res.json({
                message: `Email ${fromCache ? "found in cache" : "fetched from Apollo"} and updated`,
                contact: updatedContact,
                fromCache,
                creditCost: creditManager.CREDIT_COSTS.EMAIL_SEARCH
            });
        } else {
            return res.status(404).json({ message: "Email not found" });
        }

    } catch (error) {
        console.error("Error finding email:", error);

        // Enhanced error logging
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding email",
            details: error.response?.data || "No additional details available"
        });
    }
};

exports.findBulkPhones = async (req, res) => {
    console.log("Finding phone numbers for multiple contacts");
    try {
        const { contactListId } = req.params;
        const { contactIds } = req.body;
        const userId = req.user.userId;

        // Validate contact list exists
        const contactList = await ContactList.findById(contactListId);
        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Determine which contacts to process
        let contactsToProcess = [];
        if (Array.isArray(contactIds) && contactIds.length > 0) {
            // Process only the specified contacts
            contactsToProcess = await Contact.find({ _id: { $in: contactIds } });
        } else {
            // Process all contacts in the list
            contactsToProcess = await Contact.find({ _id: { $in: contactList.contacts } });
        }

        // Check if we have any contacts to process
        if (contactsToProcess.length === 0) {
            return res.status(400).json({ message: "No contacts to process" });
        }

        // Check if user has enough credits
        const totalCreditCost = contactsToProcess.length * creditManager.CREDIT_COSTS.PHONE_SEARCH;
        const user = await User.findById(userId);

        if (user.credits < totalCreditCost) {
            return res.status(402).json({
                message: "Insufficient credits for bulk operation",
                requiredCredits: totalCreditCost,
                availableCredits: user.credits,
                deficit: totalCreditCost - user.credits
            });
        }

        // Process contacts in batches to avoid overloading APIs
        const results = {
            total: contactsToProcess.length,
            processed: 0,
            updated: 0,
            failed: 0,
            fromCache: 0,
            fromApi: 0,
            creditsUsed: 0
        };

        // Process in smaller batches (e.g., 5 at a time) to avoid rate limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < contactsToProcess.length; i += BATCH_SIZE) {
            const batch = contactsToProcess.slice(i, i + BATCH_SIZE);

            // Process each contact in the batch
            const batchPromises = batch.map(async (contact) => {
                try {
                    results.processed++;

                    // Skip contacts without LinkedIn URLs
                    if (!contact.linkedinUrl) {
                        results.failed++;
                        return;
                    }

                    // Try to get phone from cache or Apollo API
                    const { phone, fromCache } = await getContactPhone(contact.linkedinUrl);

                    if (phone) {
                        // Update contact with phone
                        await Contact.findByIdAndUpdate(
                            contact._id,
                            { phone }
                        );
                        results.updated++;

                        if (fromCache) {
                            results.fromCache++;
                        } else {
                            results.fromApi++;
                        }

                        // Debit credits for this contact
                        await creditManager.debitCredits(
                            userId,
                            'PHONE_SEARCH',
                            `Bulk operation: ${contact.linkedinUrl.substring(0, 30)}...`
                        );
                        results.creditsUsed += creditManager.CREDIT_COSTS.PHONE_SEARCH;
                    } else {
                        results.failed++;
                    }
                } catch (error) {
                    console.error(`Error processing contact ${contact._id}:`, error);
                    results.failed++;
                }
            });

            // Wait for batch to complete
            await Promise.all(batchPromises);

            // Small delay between batches to avoid rate limits
            if (i + BATCH_SIZE < contactsToProcess.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        res.json({
            message: `Processed ${results.processed} contacts. Updated ${results.updated} phone numbers (${results.fromCache} from cache, ${results.fromApi} from API). Used ${results.creditsUsed} credits.`,
            results
        });
    } catch (error) {
        console.error("Error finding phone numbers:", error);

        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding phone numbers",
            details: error.response?.data || "No additional details available"
        });
    }
};

exports.findBulkEmails = async (req, res) => {
    console.log("Finding emails for multiple contacts");
    try {
        const { contactListId } = req.params;
        const { contactIds } = req.body;
        const userId = req.user.userId;

        // Validate contact list exists
        const contactList = await ContactList.findById(contactListId);
        if (!contactList) {
            return res.status(404).json({ message: "Contact List not found" });
        }

        // Determine which contacts to process
        let contactsToProcess = [];
        if (Array.isArray(contactIds) && contactIds.length > 0) {
            // Process only the specified contacts
            contactsToProcess = await Contact.find({ _id: { $in: contactIds } });
        } else {
            // Process all contacts in the list
            contactsToProcess = await Contact.find({ _id: { $in: contactList.contacts } });
        }

        // Check if we have any contacts to process
        if (contactsToProcess.length === 0) {
            return res.status(400).json({ message: "No contacts to process" });
        }

        // Check if user has enough credits
        const totalCreditCost = contactsToProcess.length * creditManager.CREDIT_COSTS.EMAIL_SEARCH;
        const user = await User.findById(userId);

        if (user.credits < totalCreditCost) {
            return res.status(402).json({
                message: "Insufficient credits for bulk operation",
                requiredCredits: totalCreditCost,
                availableCredits: user.credits,
                deficit: totalCreditCost - user.credits
            });
        }

        // Process contacts in batches to avoid overloading APIs
        const results = {
            total: contactsToProcess.length,
            processed: 0,
            updated: 0,
            failed: 0,
            fromCache: 0,
            fromApi: 0,
            creditsUsed: 0
        };

        // Process in smaller batches (e.g., 5 at a time) to avoid rate limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < contactsToProcess.length; i += BATCH_SIZE) {
            const batch = contactsToProcess.slice(i, i + BATCH_SIZE);

            // Process each contact in the batch
            const batchPromises = batch.map(async (contact) => {
                try {
                    results.processed++;

                    // Skip contacts without LinkedIn URLs
                    if (!contact.linkedinUrl) {
                        results.failed++;
                        return;
                    }

                    // Try to get email from cache or Apollo API
                    const { email, fromCache } = await getContactEmail(contact.linkedinUrl);

                    if (email) {
                        // Update contact with email
                        await Contact.findByIdAndUpdate(
                            contact._id,
                            { email }
                        );
                        results.updated++;

                        if (fromCache) {
                            results.fromCache++;
                        } else {
                            results.fromApi++;
                        }

                        // Debit credits for this contact
                        await creditManager.debitCredits(
                            userId,
                            'EMAIL_SEARCH',
                            `Bulk operation: ${contact.linkedinUrl.substring(0, 30)}...`
                        );
                        results.creditsUsed += creditManager.CREDIT_COSTS.EMAIL_SEARCH;
                    } else {
                        results.failed++;
                    }
                } catch (error) {
                    console.error(`Error processing contact ${contact._id}:`, error);
                    results.failed++;
                }
            });

            // Wait for batch to complete
            await Promise.all(batchPromises);

            // Small delay between batches to avoid rate limits
            if (i + BATCH_SIZE < contactsToProcess.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        res.json({
            message: `Processed ${results.processed} contacts. Updated ${results.updated} email addresses (${results.fromCache} from cache, ${results.fromApi} from API). Used ${results.creditsUsed} credits.`,
            results
        });
    } catch (error) {
        console.error("Error finding emails:", error);

        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding emails",
            details: error.response?.data || "No additional details available"
        });
    }
};
exports.findEmailByLinkedIn = async (req, res) => {
    console.log("Finding email by LinkedIn URL");
    try {
        const { linkedinUrl } = req.body;
        const userId = req.user.userId;

        if (!linkedinUrl) {
            return res.status(400).json({ message: "LinkedIn URL is required" });
        }

        // First check if user has sufficient credits
        const hasSufficientCredits = await creditManager.hasSufficientCredits(userId, 'EMAIL_SEARCH');
        if (!hasSufficientCredits) {
            return res.status(402).json({
                message: "Insufficient credits. Please purchase more credits to continue.",
                creditCost: creditManager.CREDIT_COSTS.EMAIL_SEARCH
            });
        }

        // Try to get email from cache or Apollo API
        const { email, fromCache } = await getContactEmail(linkedinUrl);

        if (email) {
            // Debit credits regardless of cache or API source
            await creditManager.debitCredits(
                userId,
                'EMAIL_SEARCH',
                `LinkedIn: ${linkedinUrl.substring(0, 30)}...`
            );

            res.json({
                message: `Email ${fromCache ? "found in cache" : "fetched from Apollo"}`,
                email,
                linkedinUrl,
                fromCache,
                creditCost: creditManager.CREDIT_COSTS.EMAIL_SEARCH
            });
        } else {
            return res.status(404).json({ message: "Email not found" });
        }

    } catch (error) {
        console.error("Error finding email:", error);

        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding email",
            details: error.response?.data || "No additional details available"
        });
    }
};

exports.findPhoneByLinkedIn = async (req, res) => {
    console.log("Finding phone by LinkedIn URL");
    try {
        const { linkedinUrl } = req.body;
        const userId = req.user.userId;

        if (!linkedinUrl) {
            return res.status(400).json({ message: "LinkedIn URL is required" });
        }

        // First check if user has sufficient credits
        const hasSufficientCredits = await creditManager.hasSufficientCredits(userId, 'PHONE_SEARCH');
        if (!hasSufficientCredits) {
            return res.status(402).json({
                message: "Insufficient credits. Please purchase more credits to continue.",
                creditCost: creditManager.CREDIT_COSTS.PHONE_SEARCH
            });
        }

        // Try to get phone from cache or Apollo API
        const { phone, fromCache } = await getContactPhone(linkedinUrl);

        if (phone) {
            // Debit credits regardless of cache or API source
            await creditManager.debitCredits(
                userId,
                'PHONE_SEARCH',
                `LinkedIn: ${linkedinUrl.substring(0, 30)}...`
            );

            res.json({
                message: `Phone ${fromCache ? "found in cache" : "fetched from Apollo"}`,
                phone,
                linkedinUrl,
                fromCache,
                creditCost: creditManager.CREDIT_COSTS.PHONE_SEARCH
            });
        } else {
            return res.status(404).json({ message: "Phone number not found" });
        }

    } catch (error) {
        console.error("Error finding phone:", error);

        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error finding phone number",
            details: error.response?.data || "No additional details available"
        });
    }
};


exports.refreshApolloData = async (req, res) => {
    console.log("Manually refreshing Apollo data");
    try {
        const { contactId } = req.params;

        // Find the contact to get LinkedIn URL
        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }

        if (!contact.linkedinUrl) {
            return res.status(400).json({ message: "Contact does not have a LinkedIn URL" });
        }

        // Force refresh from Apollo API by ignoring cache
        // Use API URLs and keys from config
        const APOLLO_API_URL = config.apolloApiUrl;
        const APOLLO_API_KEY = config.apolloApiKey;

        if (!APOLLO_API_URL || !APOLLO_API_KEY) {
            return res.status(500).json({ message: "Apollo API configuration missing" });
        }

        console.log(`Making API request to Apollo for data refresh: ${contact.linkedinUrl}`);

        const apolloResponse = await axios.post(APOLLO_API_URL, {
            api_key: APOLLO_API_KEY,
            linkedin_url: contact.linkedinUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Extract data from response
        const responseData = apolloResponse.data && apolloResponse.data.person ? apolloResponse.data.person : {};

        const email = responseData.email || null;
        const phone = responseData.phone_number || null;

        // Update both Contact and ApolloContact
        const updates = {};
        if (email) updates.email = email;
        if (phone) updates.phone = phone;

        // Only update if we have data
        if (Object.keys(updates).length > 0) {
            await Contact.findByIdAndUpdate(contactId, updates);

            // Update cache
            await updateApolloContactCache(contact.linkedinUrl, {
                email,
                phone
            });

            res.json({
                message: "Contact data refreshed from Apollo",
                updates
            });
        } else {
            res.status(404).json({ message: "No new data found from Apollo" });
        }

    } catch (error) {
        console.error("Error refreshing Apollo data:", error);

        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }

        res.status(error.response?.status || 500).json({
            error: error.message || "Error refreshing Apollo data",
            details: error.response?.data || "No additional details available"
        });
    }
};

exports.getApolloCacheStats = async (req, res) => {
    try {
        const totalCached = await ApolloContact.countDocuments();
        const withEmail = await ApolloContact.countDocuments({ email: { $ne: null } });
        const withPhone = await ApolloContact.countDocuments({ phone: { $ne: null } });
        const withBoth = await ApolloContact.countDocuments({
            email: { $ne: null },
            phone: { $ne: null }
        });

        // Get some recent entries
        const recentEntries = await ApolloContact.find()
            .sort({ lastUpdated: -1 })
            .limit(10)
            .select('linkedinUrl email phone lastUpdated');

        res.json({
            total: totalCached,
            withEmail,
            withPhone,
            withBoth,
            recentEntries
        });
    } catch (error) {
        console.error("Error getting Apollo cache stats:", error);
        res.status(500).json({ error: error.message });
    }
};


// Update Apollo contact in cache
async function updateApolloContactCache(linkedinUrl, data = {}) {
    if (!linkedinUrl) return false;

    try {
        const updateData = { lastUpdated: new Date() };

        if (data.email) {
            updateData.email = data.email;
            updateData['apolloApiStatus.emailFetched'] = true;
        }

        if (data.phone) {
            updateData.phone = data.phone;
            updateData['apolloApiStatus.phoneFetched'] = true;
        }

        // Update or create the record
        await ApolloContact.findOneAndUpdate(
            { linkedinUrl },
            updateData,
            { upsert: true, new: true }
        );

        return true;
    } catch (error) {
        console.error("Error updating Apollo contact cache:", error);
        return false;
    }
}

// Get contact phone (from cache or API) - with permanent cache
async function getContactPhone(linkedinUrl) {
    if (!linkedinUrl) {
        return { phone: null, fromCache: false };
    }

    try {
        // Check cache first
        let apolloContact = await ApolloContact.findOne({ linkedinUrl });

        // If found in cache and has phone, always use it
        if (apolloContact && apolloContact.phone) {
            return { phone: apolloContact.phone, fromCache: true };
        }

        // Not in cache or no phone in cache, call Apollo API
        // Use config for API URLs and keys
        const APOLLO_API_URL = config.apolloApiUrl;
        const APOLLO_API_KEY = config.apolloApiKey;

        if (!APOLLO_API_URL || !APOLLO_API_KEY) {
            console.error("Missing Apollo API configuration");
            return { phone: null, fromCache: false };
        }

        console.log(`Making API request to Apollo for phone: ${linkedinUrl}`);

        // Update last attempt time if record exists
        if (apolloContact) {
            await ApolloContact.findByIdAndUpdate(
                apolloContact._id,
                { 'apolloApiStatus.lastAttempt': new Date() }
            );
        }

        // Extract domain from LinkedIn URL if possible
        let domain = null;
        try {
            // Try to extract domain from profile details if we have them
            const contact = await Contact.findOne({ linkedinUrl });
            if (contact && contact.company) {
                // Clean and convert company name to potential domain
                domain = contact.company.toLowerCase()
                    .replace(/\s+/g, '')
                    .replace(/[^\w-]+/g, '')
                    .replace(/(corp|inc|llc)$/i, '') + '.com';
            }
        } catch (err) {
            console.error("Error extracting domain from contact:", err);
        }

        // Prepare request payload
        const payload = {
            api_key: APOLLO_API_KEY,
            linkedin_url: linkedinUrl
        };

        // Add domain if available to increase match accuracy
        if (domain) {
            payload.domain = domain;
        }

        // Make the API request
        const apolloResponse = await axios.post(APOLLO_API_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Try to extract phone from various possible locations in the response
        let phone = null;

        // Check if we have a person object
        if (apolloResponse.data && apolloResponse.data.person) {
            const person = apolloResponse.data.person;

            // Check direct phone number field
            if (person.phone_number) {
                phone = person.phone_number;
            }
            // Check mobile phone
            else if (person.mobile_phone) {
                phone = person.mobile_phone;
            }
            // Check any phone fields in the contact_info object
            else if (person.contact_info) {
                if (person.contact_info.phone_numbers && person.contact_info.phone_numbers.length > 0) {
                    phone = person.contact_info.phone_numbers[0].value || person.contact_info.phone_numbers[0];
                }
            }
            // Check work phones if present
            else if (person.work_phones && person.work_phones.length > 0) {
                phone = person.work_phones[0];
            }

            // Check for phone in employment history
            if (!phone && person.employment_history && person.employment_history.length > 0) {
                for (const employment of person.employment_history) {
                    if (employment.contact_info && employment.contact_info.phone_numbers && employment.contact_info.phone_numbers.length > 0) {
                        phone = employment.contact_info.phone_numbers[0].value || employment.contact_info.phone_numbers[0];
                        break;
                    }
                }
            }

            // Extract email too if available (for caching)
            let email = null;
            if (person.email) {
                email = person.email;
            }

            // Update cache with phone (if found) and any email
            await getOrCreateApolloContact(linkedinUrl, email, phone);

            if (phone) {
                return { phone, fromCache: false };
            }
        }

        // If no phone found, try a different approach with name and company
        try {
            const contact = await Contact.findOne({ linkedinUrl });
            if (contact && contact.name && contact.company) {
                // Split name into first and last name
                const nameParts = contact.name.split(' ');
                if (nameParts.length >= 2) {
                    const firstName = nameParts[0];
                    const lastName = nameParts[nameParts.length - 1];

                    const namePayload = {
                        api_key: APOLLO_API_KEY,
                        first_name: firstName,
                        last_name: lastName,
                        organization_name: contact.company
                    };

                    console.log(`Trying name-based lookup: ${firstName} ${lastName} at ${contact.company}`);

                    const nameResponse = await axios.post(APOLLO_API_URL, namePayload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',

                        }
                    });
                    console.log(nameResponse.data);

                    if (nameResponse.data && nameResponse.data.person) {
                        const person = nameResponse.data.person;
                        if (person.phone_number) {
                            phone = person.phone_number;

                            // Update cache with phone
                            await getOrCreateApolloContact(linkedinUrl, person.email || null, phone);

                            return { phone, fromCache: false, note: "found via name lookup" };
                        }
                    }
                }
            }
        } catch (nameError) {
            console.error("Error with name-based lookup:", nameError);
        }

        // No phone found, but update the attempt in cache
        if (!apolloContact) {
            await getOrCreateApolloContact(linkedinUrl);
        }

        return { phone: null, fromCache: false };
    } catch (error) {
        console.error("Error getting contact phone:", error);
        // Log complete error details for debugging
        if (error.response) {
            console.error("Error response data:", error.response.data);
            console.error("Error response status:", error.response.status);
        }
        return { phone: null, fromCache: false, error: error.message };
    }
}

// Get contact email (from cache or API) - with permanent cache
async function getContactEmail(linkedinUrl) {
    if (!linkedinUrl) {
        return { email: null, fromCache: false };
    }

    try {
        // Check cache first using the ApolloContact model as master database
        let apolloContact = await ApolloContact.findOne({ linkedinUrl });

        // If found in cache and has email, always use it
        if (apolloContact && apolloContact.email) {
            // Update the main Contact model with the email if it's missing
            const contact = await Contact.findOne({ linkedinUrl });
            if (contact && !contact.email) {
                contact.email = apolloContact.email;
                await contact.save();
            }
            return { email: apolloContact.email, fromCache: true };
        }

        // Not in cache or no email in cache, call Hunter.io API
        // Use config for API URLs and keys
        const HUNTER_API_URL = config.hunterApiUrl;
        const HUNTER_API_KEY = config.hunterApiKey;

        if (!HUNTER_API_URL || !HUNTER_API_KEY) {
            return { email: null, fromCache: false };
        }

        console.log(`Making API request to Hunter.io for email: ${linkedinUrl}`);

        // Update last attempt time if record exists
        if (apolloContact) {
            await ApolloContact.findByIdAndUpdate(
                apolloContact._id,
                { 
                    'apolloApiStatus.lastAttempt': new Date(),
                    // Rename for clarity but maintain schema compatibility
                    'apolloApiStatus.emailFetched': false
                }
            );
        }

        // Try to get contact details from our existing Contact model
        const contact = await Contact.findOne({ linkedinUrl });
        if (!contact || !contact.name) {
            console.log(`No contact details found for: ${linkedinUrl}`);
            return { email: null, fromCache: false };
        }

        // Extract domain from LinkedIn URL if possible
        let domain = null;
        try {
            if (contact.company) {
                // Clean and convert company name to potential domain
                domain = contact.company.toLowerCase()
                    .replace(/\s+/g, '')
                    .replace(/[^\w-]+/g, '')
                    .replace(/(corp|inc|llc)$/i, '') + '.com';
            }
        } catch (err) {
            console.error("Error extracting domain from contact:", err);
        }

        // We need domain, first name and last name for Hunter.io Email Finder
        if (!domain || !contact.name) {
            console.log(`Missing required data for Hunter.io lookup: ${linkedinUrl}`);
            return { email: null, fromCache: false };
        }

        // Split name into first and last name
        const nameParts = contact.name.split(' ');
        if (nameParts.length < 2) {
            console.log(`Cannot parse name into first and last name: ${contact.name}`);
            return { email: null, fromCache: false };
        }

        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];

        // Step 1: Find email using Hunter.io Email Finder API
        const emailFinderUrl = `${HUNTER_API_URL}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${HUNTER_API_KEY}`;
        
        console.log(`Trying Hunter.io email finder for: ${firstName} ${lastName} at ${domain}`);
        
        const emailFinderResponse = await axios.get(emailFinderUrl);
        
        let email = null;
        let score = 0;
        
        if (emailFinderResponse.data && 
            emailFinderResponse.data.data && 
            emailFinderResponse.data.data.email) {
            
            email = emailFinderResponse.data.data.email;
            score = emailFinderResponse.data.data.score || 0;
            
            console.log(`Found email: ${email} with confidence score: ${score}`);
            
            // Step 2: Verify the email using Hunter.io Email Verification API
            if (email) {
                const emailVerifierUrl = `${HUNTER_API_URL}/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`;
                
                console.log(`Verifying email: ${email}`);
                
                const emailVerifierResponse = await axios.get(emailVerifierUrl);
                
                let isVerified = false;
                let verificationScore = 0;
                
                if (emailVerifierResponse.data && 
                    emailVerifierResponse.data.data) {
                    
                    const verificationData = emailVerifierResponse.data.data;
                    verificationScore = verificationData.score || 0;
                    
                    // Consider an email verified if the score is above 50 or status is "deliverable"
                    isVerified = verificationScore >= 50 || 
                                 verificationData.status === "deliverable";
                    
                    console.log(`Email verification result: ${isVerified ? 'Verified' : 'Not verified'} with score: ${verificationScore}`);
                    
                    // Store all emails in the ApolloContact database regardless of verification
                    // But only return and update the main Contact model with verified emails
                    await getOrCreateApolloContact(
                        linkedinUrl, 
                        email, 
                        null, // phone is null from Hunter.io
                        isVerified
                    );

                    // Only update main Contact model with verified emails
                    if (isVerified) {
                        // Update the main Contact model with the verified email
                        await Contact.findOneAndUpdate(
                            { linkedinUrl },
                            { email: email },
                            { new: true }
                        );
                        
                        return { 
                            email, 
                            fromCache: false, 
                            confidence: score,
                            verificationScore: verificationScore,
                            verified: true
                        };
                    } else {
                        console.log(`Email ${email} failed verification checks`);
                        
                        // We still store the email in ApolloContact but mark it as not verified
                        // This is done by the getOrCreateApolloContact function above
                        
                        // We don't return unverified emails
                        return { 
                            email: null, 
                            fromCache: false,
                            message: "Email found but failed verification"
                        };
                    }
                }
            }
        }

        // No verified email found, but update the attempt in cache
        if (!apolloContact) {
            await getOrCreateApolloContact(linkedinUrl);
        }

        return { email: null, fromCache: false };
    } catch (error) {
        console.error("Error getting contact email:", error);
        // Log complete error details for debugging
        if (error.response) {
            console.error("Error response data:", error.response.data);
            console.error("Error response status:", error.response.status);
        }
        return { email: null, fromCache: false, error: error.message };
    }
}

// Helper function to create or update ApolloContact as the master database
async function getOrCreateApolloContact(
    linkedinUrl, 
    email = null, 
    phone = null,
    emailVerified = false
) {
    try {
        let apolloContact = await ApolloContact.findOne({ linkedinUrl });
        
        if (apolloContact) {
            // Update existing record
            // Only update email if it's provided and either there's no existing email
            // or the new email is verified
            if (email && (!apolloContact.email || emailVerified)) {
                apolloContact.email = email;
            }
            
            // Only update phone if it's provided and there's no existing phone
            if (phone && !apolloContact.phone) {
                apolloContact.phone = phone;
            }
            
            // Update status fields
            apolloContact.lastUpdated = new Date();
            apolloContact.apolloApiStatus = {
                emailFetched: !!email || apolloContact.apolloApiStatus?.emailFetched || false,
                phoneFetched: !!phone || apolloContact.apolloApiStatus?.phoneFetched || false,
                lastAttempt: new Date()
            };
            
            await apolloContact.save();
            return apolloContact;
        } else {
            // Create new record
            apolloContact = new ApolloContact({
                linkedinUrl,
                email,
                phone,
                lastUpdated: new Date(),
                apolloApiStatus: {
                    emailFetched: !!email,
                    phoneFetched: !!phone,
                    lastAttempt: new Date()
                }
            });
            
            await apolloContact.save();
            return apolloContact;
        }
    } catch (error) {
        console.error("Error creating/updating ApolloContact:", error);
        return null;
    }
}

async function getOrCreateApolloContact(linkedinUrl, email = null, phone = null) {
    try {
        let apolloContact = await ApolloContact.findOne({ linkedinUrl });

        if (apolloContact) {
            // Update existing record with non-null values only
            const updateData = { 'apolloApiStatus.lastUpdated': new Date() };
            if (email !== null) updateData.email = email;
            if (phone !== null) updateData.phone = phone;

            await ApolloContact.findByIdAndUpdate(apolloContact._id, updateData);
            return apolloContact;
        } else {
            // Create new record
            apolloContact = new ApolloContact({
                linkedinUrl,
                email,
                phone,
                apolloApiStatus: {
                    lastAttempt: new Date(),
                    lastUpdated: new Date()
                }
            });

            await apolloContact.save();
            return apolloContact;
        }
    } catch (error) {
        console.error("Error updating Apollo contact cache:", error);
        return null;
    }
}