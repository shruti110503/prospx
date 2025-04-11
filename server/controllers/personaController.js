const axios = require("axios");
const Persona = require("../models/Persona");
const User = require("../models/User");
const config = require("../config"); // Import the configuration handler

/**
 * LinkedIn Sales Navigator Constants
 */
// Company headcount options
const COMPANY_HEADCOUNT_OPTIONS = [
    "Self-employed",
    "1-10",
    "11-50",
    "51-200",
    "201-500",
    "501-1,000",
    "1,001-5,000",
    "5,001-10,000",
    "10,001+"
];

// Define function options 
const FUNCTION_OPTIONS = [
    "Marketing", 
    "Sales", 
    "Finance", 
    "Engineering", 
    "Information Technology", 
    "Human Resources", 
    "Operations", 
    "Product Management", 
    "Research", 
    "Legal", 
    "Consulting", 
    "Education"
];

// Company HQ location options
const COMPANY_HQ_OPTIONS = [
    "South America",
    "Asia",
    "Nordics",
    "APJ",
    "Benelux",
    "North America",
    "DACH"
];

// Geography options
const GEOGRAPHY_OPTIONS = [
    "EMEA",
    "Oceania",
    "APAC",
    "MENA",
    "Europe",
    "Africa",
    "United States",
    "South America",
    "Asia",
    "Nordics",
    "APJ",
    "Benelux",
    "North America",
    "DACH"
];

// Industry options
const INDUSTRY_OPTIONS = [
    "Information Technology and Services",
    "Computer Software",
    "Financial Services",
    "Marketing and Advertising",
    "Internet",
    "Telecommunications",
    "Banking",
    "Management Consulting",
    "Hospital & Health Care",
    "Education Management",
    "Insurance",
    "Real Estate",
    "Construction",
    "Retail",
    "Automotive",
    "Oil & Energy",
    "Hospitality",
    "Government Administration",
    "Mechanical or Industrial Engineering",
    "Higher Education",
    "Accounting",
    "Electrical/Electronic Manufacturing",
    "Media and Telecommunications",
    "Information Services",
    "Advertising Services",
    "Marketing Services",
    "IT Services and IT Consulting",
    "Software Development",
    "Bars, Taverns, and Nightclubs",
    "Aviation & Aerospace",
    "Medical Devices",
    "Industrial Automation",
    "Manufacturing",
    "Defense & Space"
];

// Seniority levels that LinkedIn recognizes
const SENIORITY_OPTIONS = [
    "Owner",
    "Partner",
    "CXO",
    "VP",
    "Director",
    "Manager",
    "Senior"
];

// Industry mapping to LinkedIn IDs
const INDUSTRY_MAPPING = {
    "Information Technology and Services": "96",
    "Computer Software": "4",
    "Financial Services": "43",
    "Marketing and Advertising": "80",
    "Internet": "6",
    "Telecommunications": "8",
    "Banking": "41",
    "Management Consulting": "94",
    "Hospital & Health Care": "14",
    "Education Management": "69",
    "Insurance": "42",
    "Real Estate": "44",
    "Construction": "48",
    "Retail": "27",
    "Automotive": "53",
    "Oil & Energy": "32",
    "Hospitality": "25",
    "Government Administration": "130",
    "Mechanical or Industrial Engineering": "51",
    "Higher Education": "68",
    "Accounting": "47",
    "Electrical/Electronic Manufacturing": "52",
    "Media and Telecommunications": "3133",
    "Information Services": "84",
    "Advertising Services": "80",
    "Marketing Services": "1862",
    "IT Services and IT Consulting": "96",
    "Software Development": "4",
    "Bars, Taverns, and Nightclubs": "2217",
    "Aviation & Aerospace": "94",
    "Medical Devices": "14",
    "Industrial Automation": "96",
    "Manufacturing": "97",
    "Defense & Space": "100",
    "Mechanical & Industrial Engineering": "51"
};

/**
 * Parses user prompts to extract key information for filter generation
 * @param {string} prompt - The user's original prompt
 * @returns {Object} - Parsed information including geography detection
 */
function parseUserPrompt(prompt) {
    // Initialize with minimal structure, treating prompt as general search intent
    const parsedInfo = {
        originalQuery: prompt,
        extractedKeywords: [],
        hasGeographyMention: false
    };

    // Extract any potential experience information (numbers followed by year/years/yr/yrs)
    const experienceMatch = prompt.match(/\b(\d+)\s*(?:year|years|yr|yrs)(?:\s+(?:of|in))?\s+(?:experience)?\b/i);
    if (experienceMatch) {
        parsedInfo.experience = experienceMatch[1];
    }

    // Extract potential location - look for common location prepositions
    const locationPattern = /\b(?:in|from|at|near|within)\s+([A-Za-z\s,]+?)(?:\s+(?:area|region|city|state|country))?\b/i;
    const locationMatch = prompt.match(locationPattern);
    if (locationMatch && locationMatch[1] && locationMatch[1].length > 2) {
        // Basic filtering to avoid capturing articles or very short words
        const loc = locationMatch[1].trim();
        if (!['the', 'a', 'an', 'my', 'our'].includes(loc.toLowerCase())) {
            parsedInfo.location = loc;
            parsedInfo.hasGeographyMention = true;
        }
    }

    // Additional geography detection - check for explicit region mentions
    const geographyTerms = [
        'EMEA', 'Oceania', 'APAC', 'MENA', 'Europe', 'Africa', 'United States', 
        'South America', 'Asia', 'Nordics', 'APJ', 'Benelux', 'North America', 'DACH',
        'USA', 'UK', 'Australia', 'Canada', 'Germany', 'France', 'Japan', 'China', 'India'
    ];
    
    for (const term of geographyTerms) {
        if (prompt.toLowerCase().includes(term.toLowerCase())) {
            parsedInfo.hasGeographyMention = true;
            break;
        }
    }

    // Extract significant words that might be important for search
    const stopWords = ['i', 'me', 'my', 'want', 'need', 'looking', 'for', 'find', 'get', 'have', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'to', 'of', 'with', 'and', 'or', 'who', 'what', 'when', 'where', 'how', 'why'];

    // Split by spaces and common punctuation
    const words = prompt.toLowerCase().split(/[\s,.;:!?]+/);

    // Extract potentially significant terms (2+ character words that aren't stop words)
    const significantTerms = words.filter(word =>
        word.length > 2 && !stopWords.includes(word)
    );

    // Add to extractedKeywords
    parsedInfo.extractedKeywords = [...new Set(significantTerms)]; // Remove duplicates

    // Look for potential industry mentions
    const industryIndicators = ['industry', 'sector', 'field', 'market'];
    for (const indicator of industryIndicators) {
        const index = prompt.toLowerCase().indexOf(indicator);
        if (index !== -1) {
            // Look at the words before this indicator to find potential industry name
            const beforeText = prompt.substring(0, index).trim();
            const lastSpace = beforeText.lastIndexOf(' ');
            if (lastSpace !== -1) {
                const potentialIndustry = beforeText.substring(lastSpace).trim();
                if (potentialIndustry.length > 2 && !stopWords.includes(potentialIndustry.toLowerCase())) {
                    parsedInfo.industry = potentialIndustry;
                    break;
                }
            }
        }
    }

    return parsedInfo;
}

/**
 * Generates an enhanced prompt based on parsed information
 * @param {Object} parsedInfo - Basic extracted information from the user prompt
 * @param {string} originalPrompt - The original user prompt
 * @returns {string} - Enhanced prompt for the AI
 */
function generateEnhancedPrompt(parsedInfo, originalPrompt) {
    // Create a prompt for the AI with original intent
    let enhancedPrompt = `Generate a concise LinkedIn targeting persona based on this search query: "${originalPrompt}"`;

    // Add context from parsing
    if (parsedInfo.location) {
        enhancedPrompt += `\nLocation mentioned: ${parsedInfo.location}`;
    }

    if (parsedInfo.experience) {
        enhancedPrompt += `\nExperience mentioned: ${parsedInfo.experience} years`;
    }

    enhancedPrompt += `\n\nCreate a concise targeting persona with the following structure:

**Who I'm looking for:**
- Brief description of the target role, with essential responsibilities and experience level
- 1-3 specific characteristics of ideal candidates

**Companies like:**
- 2-3 descriptions of company types that would be good targets
- Industry focus if applicable

**Specifically, these companies:**
- Any specific company characteristics to focus on

**People like:**
- Brief description of the decision-makers' mindset or situation
- Any alternative roles that might be relevant

**In these geographies:**
- Companies headquartered in: [locations]
- People based in: [locations]

**Exclude:**
- Brief list of what should be excluded from targeting

Keep each section to 2-4 bullet points maximum. Be direct and concise, avoiding detailed explanations. Focus on the essential criteria only. Format should use bold headers with simple bullet points underneath.`;

    return enhancedPrompt;
}

/**
 * Process the AI-generated response
 * @param {string} aiResponse - The raw AI-generated content
 * @param {Object} parsedInfo - The parsed information from the user prompt
 * @returns {Object} - Structured response ready for filter generation
 */
function processAIResponse(aiResponse, parsedInfo) {
    return {
        originalQuery: parsedInfo.originalQuery,
        persona: aiResponse,
    };
}

/**
 * Creates a user-friendly display format for the filters
 * @param {Object} linkedinFilters - The validated LinkedIn filters
 * @returns {Object} - Formatted filters for display
 */
function createFilterDisplay(linkedinFilters) {
    return {
        keywords: Array.isArray(linkedinFilters.keywords) ? linkedinFilters.keywords.join(' OR ') : '',
        jobTitle: linkedinFilters.titleFilters || [],
        currentCompany: linkedinFilters.companyFilters?.companyNames || [],
        companyHeadcount: linkedinFilters.companyFilters?.companyHeadcount || [],
        companyHQ: linkedinFilters.companyHQ || [],
        geography: linkedinFilters.geographyFilters || [],
        industries: linkedinFilters.industryFilters || [],
        functionFilters: linkedinFilters.functionFilters || [],
        seniority: linkedinFilters.seniority || [],
        exclusions: linkedinFilters.exclusions || []
    };
}

/**
 * Validates LinkedIn filters against allowed options
 * @param {Object} filters - The generated filters
 * @returns {Object} - The validated filters
 */
function validateRemainingFilters(filters) {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(filters));
    
    // Ensure all expected fields exist
    sanitized.keywords = Array.isArray(sanitized.keywords) ? sanitized.keywords : [];
    sanitized.titleFilters = Array.isArray(sanitized.titleFilters) ? sanitized.titleFilters : [];
    sanitized.industryFilters = Array.isArray(sanitized.industryFilters) ? sanitized.industryFilters : [];
    
    // Ensure companyFilters fields exist
    if (!sanitized.companyFilters) sanitized.companyFilters = {};
    sanitized.companyFilters.companyHeadcount = Array.isArray(sanitized.companyFilters.companyHeadcount) ? 
        sanitized.companyFilters.companyHeadcount : [];
    
    // Ensure other fields exist
    sanitized.companyHQ = Array.isArray(sanitized.companyHQ) ? sanitized.companyHQ : [];
    sanitized.geographyFilters = Array.isArray(sanitized.geographyFilters) ? sanitized.geographyFilters : [];
    sanitized.functionFilters = Array.isArray(sanitized.functionFilters) ? sanitized.functionFilters : [];
    sanitized.seniority = Array.isArray(sanitized.seniority) ? sanitized.seniority : [];
    sanitized.exclusions = Array.isArray(sanitized.exclusions) ? sanitized.exclusions : [];
    
    // Validate against allowed options
    sanitized.industryFilters = sanitized.industryFilters.filter(industry => 
        INDUSTRY_OPTIONS.includes(industry));
    sanitized.companyFilters.companyHeadcount = sanitized.companyFilters.companyHeadcount.filter(headcount => 
        COMPANY_HEADCOUNT_OPTIONS.includes(headcount));
    sanitized.companyHQ = sanitized.companyHQ.filter(hq => 
        COMPANY_HQ_OPTIONS.includes(hq));
    sanitized.geographyFilters = sanitized.geographyFilters.filter(geography => 
        GEOGRAPHY_OPTIONS.includes(geography));
    sanitized.seniority = sanitized.seniority.filter(seniority => 
        SENIORITY_OPTIONS.includes(seniority));
    sanitized.functionFilters = sanitized.functionFilters.filter(func => 
        FUNCTION_OPTIONS.includes(func));
    
    return sanitized;
}

/**
 * Maps a headcount value to LinkedIn's ID system
 * @param {string} value - Headcount range string
 * @returns {string} - LinkedIn headcount ID
 */
function mapHeadcountToLinkedInId(value) {
    // If it's already an ID (A-I), return it
    if (/^[A-I]$/.test(value)) {
        return value;
    }

    // If it's a number, map it to the correct range
    if (!isNaN(value)) {
        const numValue = parseInt(value);
        if (numValue <= 10) return "B";
        if (numValue <= 50) return "C";
        if (numValue <= 200) return "D";
        if (numValue <= 500) return "E";
        if (numValue <= 1000) return "F";
        if (numValue <= 5000) return "G";
        if (numValue <= 10000) return "H";
        return "I";
    }

    // Map standard ranges to IDs
    const headcountMapping = {
        "Self-employed": "A",
        "1-10": "B",
        "11-50": "C",
        "51-200": "D",
        "201-500": "E",
        "501-1000": "F",
        "501-1,000": "F",
        "1,001-5,000": "G",
        "5,001-10,000": "H",
        "10,001+": "I"
    };

    return headcountMapping[value] || "E"; // Default to medium-sized companies
}

/**
 * Gets LinkedIn industry ID from industry name
 * @param {string} industryName - Industry name
 * @returns {string} - Industry ID
 */
function getIndustryId(industryName) {
    // First try to find in our mapping
    if (INDUSTRY_MAPPING[industryName]) {
        return INDUSTRY_MAPPING[industryName];
    }

    // If not found, check if the industry name itself is numeric (might already be an ID)
    if (/^\d+$/.test(industryName)) {
        return industryName;
    }

    // Return a default value if not found
    return "96"; // Information Technology and Services as fallback
}

/**
 * Format filters for LinkedIn Sales Navigator URL
 * @param {Object} filters - Filter object
 * @returns {Object} - Formatted filters
 */
function formatFiltersForLinkedIn(filters) {
    return {
        // Keywords are now stored as a direct string for proper URL formatting
        keywords: filters.keywords || "",

        jobTitles: (filters.jobTitles || []).map(title => {
            if (typeof title === 'string') {
                return { label: title };
            }
            return title;
        }),

        industries: (filters.industries || []).map(industry => {
            if (typeof industry === 'string') {
                const industryId = getIndustryId(industry);
                return {
                    id: industryId,
                    label: industry
                };
            }
            return industry;
        }),

        geographies: (filters.geographies || []).map(geo => {
            if (typeof geo === 'string') {
                return {
                    text: geo,
                    selectionType: "INCLUDED"
                };
            }
            return geo;
        }),

        companyHQLocations: (filters.companyHQLocations || []).map(hq => {
            if (typeof hq === 'string') {
                return { label: hq };
            }
            return hq;
        }),

        companyHeadCounts: (filters.companyHeadCounts || []).map(hc => {
            if (typeof hc === 'string') {
                return { label: hc };
            }
            return hc;
        }),

        companyNames: (filters.companyNames || []).map(company => {
            if (typeof company === 'string') {
                return {
                    text: company,
                    selectionType: "INCLUDED"
                };
            }
            return company;
        }),

        excludedCompanyNames: (filters.excludedCompanyNames || []).map(company => {
            if (typeof company === 'string') {
                return {
                    text: company,
                    selectionType: "EXCLUDED"
                };
            }
            return company;
        })
    };
}

/**
 * Generates a LinkedIn Sales Navigator URL from filters
 * @param {Object} filters - Formatted filters
 * @returns {string} - Sales Navigator URL
 */
function generateSalesNavigatorUrl(filters) {
    const baseUrl = 'https://www.linkedin.com/sales/search/people?query=';

    // Create a unique search ID
    const searchId = Math.floor(Math.random() * 10000000000);

    // Start building query parts
    let queryComponents = [];

    // Add spell correction and search params
    queryComponents.push(`spellCorrectionEnabled:true`);
    queryComponents.push(`recentSearchParam:(id:${searchId},doLogHistory:true)`);

    // Add filters list
    let filterParts = [];

    // Helper function to prepare text for URL
    const prepareText = (value) => {
        if (!value) return '';
        return encodeURIComponent(value.toString().trim());
    };

    // Industries
    if (filters.industries && filters.industries.length > 0) {
        const industries = filters.industries.map(ind => {
            if (typeof ind === 'string') {
                const industryId = getIndustryId(ind);
                return `(id:${industryId},text:${prepareText(ind)},selectionType:INCLUDED)`;
            } else {
                const id = ind.id || '';
                const text = ind.label || ind.text || '';
                return `(id:${id},text:${prepareText(text)},selectionType:INCLUDED)`;
            }
        }).join(',');

        if (industries) {
            filterParts.push(`(type:INDUSTRY,values:List(${industries}))`);
        }
    }

    // Job Titles
    if (filters.jobTitles && filters.jobTitles.length > 0) {
        const titles = filters.jobTitles.map(title => {
            const titleText = typeof title === 'string' ? title : (title.label || title.text || '');
            return `(text:${prepareText(titleText)},selectionType:INCLUDED)`;
        }).join(',');

        if (titles) {
            filterParts.push(`(type:CURRENT_TITLE,values:List(${titles}))`);
        }
    }

    // Company Headcount - With proper LinkedIn IDs
    if (filters.companyHeadCounts && filters.companyHeadCounts.length > 0) {
        const headcounts = filters.companyHeadCounts.map(hc => {
            if (typeof hc === 'string') {
                // Map to LinkedIn's headcount ID system
                const headcountMapping = {
                    "Self-employed": "A",
                    "1-10": "B",
                    "11-50": "C",
                    "51-200": "D",
                    "201-500": "E",
                    "501-1000": "F",
                    "501-1,000": "F",
                    "1,001-5,000": "G",
                    "5,001-10,000": "H",
                    "10,001+": "I"
                };

                // Try to find the ID, default to medium-sized if not found
                const id = headcountMapping[hc] || 'E';
                return `(id:${id},text:${prepareText(hc)},selectionType:INCLUDED)`;
            } else {
                const id = hc.id || '';
                const text = hc.text || hc.label || '';
                return `(id:${id},text:${prepareText(text)},selectionType:INCLUDED)`;
            }
        }).join(',');

        if (headcounts) {
            filterParts.push(`(type:COMPANY_HEADCOUNT,values:List(${headcounts}))`);
        }
    }

    // Company HQ Locations
    if (filters.companyHQLocations && filters.companyHQLocations.length > 0) {
        const hqLocations = filters.companyHQLocations.map(hq => {
            // Handle different input formats
            if (typeof hq === 'string') {
                // For South America and similar regions, we need to provide the region ID
                const regionIdMapping = {
                    "South America": "104514572",
                    "North America": "102221843",
                    "Europe": "100506914",
                    "Asia": "102393603",
                    "Africa": "103537801",
                    "Oceania": "101452733",
                    "DACH": "91000007"
                };

                const id = regionIdMapping[hq] || '';
                if (id) {
                    return `(id:${id},text:${prepareText(hq)},selectionType:INCLUDED)`;
                }
                return `(text:${prepareText(hq)},selectionType:INCLUDED)`;
            } else {
                const text = hq.label || hq.text || '';
                const id = hq.id || '';
                if (id) {
                    return `(id:${id},text:${prepareText(text)},selectionType:INCLUDED)`;
                }
                return `(text:${prepareText(text)},selectionType:INCLUDED)`;
            }
        }).join(',');

        if (hqLocations) {
            filterParts.push(`(type:COMPANY_HEADQUARTERS,values:List(${hqLocations}))`);
        }
    }

    // Geographies
    if (filters.geographies && filters.geographies.length > 0) {
        // First, separate country/region filters from city/area filters
        const regionFilters = [];
        const locationFilters = [];

        filters.geographies.forEach(geo => {
            // Check if it's a region or country
            const isRegion = GEOGRAPHY_OPTIONS.includes(
                typeof geo === 'string' ? geo : (geo.text || '')
            );

            // Check if it has an ID that matches a country/region ID pattern
            const hasRegionId = typeof geo === 'object' && geo.id &&
                ["103644278", "104514572", "102221843", "100506914", "102393603", "103537801", "101452733", "91000006",
                    "91000007", "91000008", "91000009", "91000010", "91000011", "91000012"].includes(geo.id);

            if (isRegion || hasRegionId) {
                regionFilters.push(geo);
            } else {
                // If it contains "Area" in the text, it's likely a metropolitan area
                const geoText = typeof geo === 'string' ? geo : (geo.text || '');
                if (geoText.includes('Area')) {
                    locationFilters.push(geo);
                } else {
                    // For any other type of geography, add to appropriate category
                    locationFilters.push(geo);
                }
            }
        });

        // Process region filters if any exist
        if (regionFilters.length > 0) {
            const geos = regionFilters.map(geo => {
                if (typeof geo === 'string') {
                    // Handle region mapping similar to headquarters
                    const regionIdMapping = {
                        "South America": "104514572",
                        "North America": "102221843",
                        "Europe": "100506914",
                        "Asia": "102393603",
                        "Africa": "103537801",
                        "Oceania": "101452733",
                        "United States": "103644278",
                        "EMEA": "91000006",
                        "APAC": "91000007",
                        "MENA": "91000008",
                        "Nordics": "91000009",
                        "APJ": "91000010",
                        "Benelux": "91000011",
                        "DACH": "91000012"
                    };

                    const id = regionIdMapping[geo] || '';
                    if (id) {
                        return `(id:${id},text:${prepareText(geo)},selectionType:INCLUDED)`;
                    }
                    return `(text:${prepareText(geo)},selectionType:INCLUDED)`;
                } else {
                    const text = geo.text || '';
                    const id = geo.id || '';
                    const selectionType = geo.selectionType || 'INCLUDED';

                    if (id) {
                        return `(id:${id},text:${prepareText(text)},selectionType:${selectionType})`;
                    }
                    return `(text:${prepareText(text)},selectionType:${selectionType})`;
                }
            }).join(',');

            if (geos) {
                filterParts.push(`(type:REGION,values:List(${geos}))`);
            }
        }

        // Process location/area filters if any exist
        if (locationFilters.length > 0) {
            const locations = locationFilters.map(geo => {
                if (typeof geo === 'string') {
                    return `(text:${prepareText(geo)},selectionType:INCLUDED)`;
                } else {
                    const text = geo.text || '';
                    const id = geo.id || '';
                    const selectionType = geo.selectionType || 'INCLUDED';

                    if (id) {
                        return `(id:${id},text:${prepareText(text)},selectionType:${selectionType})`;
                    }
                    return `(text:${prepareText(text)},selectionType:${selectionType})`;
                }
            }).join(',');

            if (locations) {
                filterParts.push(`(type:GEOGRAPHY,values:List(${locations}))`);
            }
        }
    }

    // Company Names
    if (filters.companyNames && filters.companyNames.length > 0) {
        const companies = filters.companyNames.map(company => {
            const companyText = typeof company === 'string' ? company : (company.label || company.text || '');
            return `(text:${prepareText(companyText)},selectionType:INCLUDED)`;
        });

        // Add excluded companies if present
        const excludedCompanies = (filters.excludedCompanyNames || []).map(company => {
            const companyText = typeof company === 'string' ? company : (company.label || company.text || '');
            return `(text:${prepareText(companyText)},selectionType:EXCLUDED)`;
        });

        const allCompanies = [...companies, ...excludedCompanies].join(',');

        if (allCompanies) {
            filterParts.push(`(type:CURRENT_COMPANY,values:List(${allCompanies}))`);
        }
    }

    // Build the filters section if we have any filters
    if (filterParts.length > 0) {
        queryComponents.push(`filters:List(${filterParts.join(',')})`);
    }

    // Handle keywords
    if (filters.keywords && filters.keywords.trim()) {
        queryComponents.push(`keywords:${prepareText(filters.keywords)}`);
    }

    // Construct the final query string
    const queryString = `(${queryComponents.join(',')})`;

    // Generate a session ID
    const sessionId = btoa(Math.random().toString()).substring(0, 22) + '==';

    return `${baseUrl}${encodeURIComponent(queryString)}&sessionId=${sessionId}`;
}

/**
 * Create a new Persona
 */
exports.createPersona = async (req, res) => {
    try {
        const { name, description, filters } = req.body;
        const userId = req.user.userId;

        const persona = new Persona({ name, description, filters });
        await persona.save();

        // Add persona reference to user
        await User.findByIdAndUpdate(userId, { $push: { personas: persona._id } });

        res.status(201).json({ message: "Persona created successfully", persona });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updatePersona = async (req, res) => {
    try {
        const { personaId } = req.params;
        const { name, description, filters } = req.body;

        const updatedData = {};
        if (name) updatedData.name = name;
        if (description) updatedData.description = description;
        if (filters) updatedData.filters = filters;

        const persona = await Persona.findByIdAndUpdate(personaId, updatedData, { new: true });

        if (!persona) {
            return res.status(404).json({ message: "Persona not found" });
        }

        res.json({ message: "Persona updated successfully", persona });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Delete a Persona
 */
exports.deletePersona = async (req, res) => {
    try {
        const { personaId } = req.params;
        const userId = req.user.userId;

        const persona = await Persona.findByIdAndDelete(personaId);
        if (!persona) {
            return res.status(404).json({ message: "Persona not found" });
        }

        // Remove from User's Personas
        await User.findByIdAndUpdate(userId, { $pull: { personas: personaId } });

        res.json({ message: "Persona deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get all Personas for a User
 */
exports.getUserPersonas = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).populate("personas");

        res.json(user.personas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Generate enhanced persona description from a user prompt
 */
exports.updatePrompt = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;

        // Parse the user prompt to extract minimal information
        const parsedInfo = parseUserPrompt(prompt);

        // Generate an enhanced prompt based on the parsed information
        const enhancedPrompt = generateEnhancedPrompt(parsedInfo, prompt);

        // Call Gemini API with the enhanced prompt
        const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.geminiApiKey
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: enhancedPrompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            throw new Error(`Gemini API Error (${geminiResponse.status}): ${errorText}`);
        }

        const result = await geminiResponse.json();
        
        // Extract the text from Gemini response
        const aiGeneratedContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!aiGeneratedContent) {
            throw new Error('Invalid or empty response from Gemini API');
        }

        // Process and structure the AI response for optimal filter generation
        const processedResponse = processAIResponse(aiGeneratedContent, parsedInfo);

        return res.status(200).json({
            originalPrompt: prompt,
            enhancedPersona: processedResponse,
            hasGeographyMention: parsedInfo.hasGeographyMention,
            rawResponse: result
        });
    } catch (error) {
        console.error('Error processing AI request:', error);
        return res.status(500).json({
            error: error.message,
        });
    }
};

/**
 * Generate LinkedIn filters based on a persona description
 */
exports.generateFilters = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { description } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Persona description is required' });
        }

        // Parse the user prompt to detect if geography is explicitly mentioned
        const parsedInfo = parseUserPrompt(description);

        // Format the options as a string to include in the prompt
        const formattedIndustryOptions = INDUSTRY_OPTIONS.map(industry => `"${industry}"`).join(", ");
        const formattedGeographyOptions = GEOGRAPHY_OPTIONS.map(geography => `"${geography}"`).join(", ");
        const formattedHeadcountOptions = COMPANY_HEADCOUNT_OPTIONS.map(headcount => `"${headcount}"`).join(", ");
        const formattedHQOptions = COMPANY_HQ_OPTIONS.map(hq => `"${hq}"`).join(", ");
        const formattedSeniorityOptions = SENIORITY_OPTIONS.map(seniority => `"${seniority}"`).join(", ");
        const formattedFunctionOptions = FUNCTION_OPTIONS.map(func => `"${func}"`).join(", ");

        // Examples of well-known companies that would be valid to use
        const exampleCompanies = "Microsoft, Google, Amazon, Salesforce, Oracle, IBM, SAP, Adobe, Cisco, Intel, Meta, Dell, HP, Accenture, Deloitte, KPMG, PwC, EY";

        // Construct the Gemini API prompt
        const promptText = `I need you to analyze this persona description and generate LinkedIn Sales Navigator filters:
  
${description}

CRITICAL INSTRUCTIONS FOR FILTERS:

COMPANY NAMES FILTER:
- The companyNames filter can ONLY include actual, specific company names like: ${exampleCompanies}
- DO NOT include generic descriptors like "B2B companies", "SaaS companies", "technology firms", "startups", etc.
- References to company types or categories are NEVER valid in this field
- Only include specific named companies explicitly mentioned in the description (e.g., "Microsoft", "IBM")
- If no specific company names are mentioned, leave the companyNames array COMPLETELY EMPTY ([])
- LinkedIn only accepts real companies in this field, not descriptions

KEYWORDS FILTER:
- Keywords should be specific search terms that identify the target persona
- Use 1-3 clear, concise terms (1-3 words each) that would appear in profiles
- Good examples: "digital marketing", "supply chain", "cloud infrastructure", "product management"
- Bad examples: phrases with "and", "or", long descriptions, or vague terms
- These keywords will be searched across LinkedIn profiles, so choose terms professionals would use

GEOGRAPHY FILTER:
- ONLY include geography filters if the user has explicitly mentioned a location or region
${parsedInfo.hasGeographyMention ? '- Use the geography mentioned in the description' : '- Leave the geographyFilters array COMPLETELY EMPTY ([]) as no location was specified'}

OTHER FILTER REQUIREMENTS:
- Use ONLY values from these specific LinkedIn Sales Navigator filter options:
  • Company Headcount: ${formattedHeadcountOptions}
  • Company HQ Location: ${formattedHQOptions}
  • Geography: ${formattedGeographyOptions}
  • Industry: ${formattedIndustryOptions}
  • Seniority: ${formattedSeniorityOptions}
  • Function: ${formattedFunctionOptions}

Return ONLY this JSON object with no additional text:

{
    "keywords": ["1-3 specific professional terms/skills that would appear in target profiles"],
    "titleFilters": ["2-3 specific job titles inferred from the description"],
    "industryFilters": ["1-2 industries ONLY from the Industry options list"],
    "companyFilters": {
        "companyNames": [],
        "companyHeadcount": ["1-2 company sizes ONLY from the Company Headcount options list"]
    },
    "companyHQ": ["1-2 HQ locations ONLY from the Company HQ Location options list"],
    "geographyFilters": ${parsedInfo.hasGeographyMention ? '["1-2 locations ONLY from the Geography options list"]' : '[]'},
    "functionFilters": ["1-2 functions ONLY from the Function options list"],
    "seniority": ["1-2 seniority levels ONLY from the Seniority options list"],
    "exclusions": ["Any explicit exclusions mentioned in the description"]
}`;

        // Call Gemini API
        const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.geminiApiKey
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: promptText
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            throw new Error(`Gemini API Error (${geminiResponse.status}): ${errorText}`);
        }

        const result = await geminiResponse.json();
        
        // Extract the text from Gemini response
        const responseContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!responseContent) {
            throw new Error('Invalid or empty response from Gemini API');
        }

        try {
            // Clean the response content - remove any markdown code block indicators
            const cleanedContent = responseContent.replace(/```json|```/g, '').trim();
            
            // Parse the text response into a JSON object
            let linkedinFilters = JSON.parse(cleanedContent);

            // Enforce empty companyNames array - safest approach to prevent invalid values
            if (linkedinFilters.companyFilters && Array.isArray(linkedinFilters.companyFilters.companyNames)) {
                // Set to empty array unless it contains specific known company names
                const knownCompanies = [
                    "Microsoft", "Google", "Amazon", "Salesforce", "Oracle", "IBM", "SAP", "Adobe", 
                    "Cisco", "Intel", "Meta", "Dell", "HP", "Accenture", "Deloitte", "KPMG", "PwC", 
                    "EY", "Apple", "Netflix", "Zoom", "Twitter", "LinkedIn", "Shopify", "Stripe",
                    "Airbnb", "Uber", "Lyft", "Slack", "Atlassian", "Zendesk", "Twilio", "Square",
                    "HubSpot", "ServiceNow", "Workday", "Notion", "Airtable", "Dropbox", "Box"
                ];
                
                const validCompanies = linkedinFilters.companyFilters.companyNames.filter(company => {
                    if (!company) return false;
                    
                    // Check if it's a known company (case insensitive)
                    const isKnown = knownCompanies.some(known => 
                        known.toLowerCase() === company.toLowerCase());
                    
                    // Additional validation for possible valid company names
                    const isPossiblyValid = 
                        // No spaces suggests it might be a company name
                        (company.indexOf(' ') === -1) || 
                        // Short company names (1-2 words) are more likely to be actual companies
                        (company.split(' ').length <= 2 && 
                         // No generic terms
                         !/companies|business|tech|saas|software|industry|market/i.test(company));
                    
                    return isKnown || isPossiblyValid;
                });
                
                // If no valid companies were found, keep the array empty
                if (validCompanies.length === 0) {
                    linkedinFilters.companyFilters.companyNames = [];
                } else {
                    linkedinFilters.companyFilters.companyNames = validCompanies;
                }
            } else {
                if (!linkedinFilters.companyFilters) linkedinFilters.companyFilters = {};
                linkedinFilters.companyFilters.companyNames = [];
            }

            // Validate keywords to ensure they're professional terms and not phrases
            if (linkedinFilters.keywords && Array.isArray(linkedinFilters.keywords)) {
                linkedinFilters.keywords = linkedinFilters.keywords
                    .filter(keyword => {
                        if (!keyword) return false;
                        
                        // Filter out keywords that are too long or contain connecting words
                        return keyword.split(' ').length <= 3 && 
                               !/\band\b|\bor\b|\bfor\b|\bwith\b|\bthat\b/i.test(keyword);
                    })
                    .map(keyword => keyword.trim());
            }

            // Enforce empty geographyFilters if user didn't mention geography
            if (!parsedInfo.hasGeographyMention) {
                linkedinFilters.geographyFilters = [];
            }

            // Validate all other filters against allowed options
            linkedinFilters = validateRemainingFilters(linkedinFilters);

            // Create a user-friendly format of the filters for display
            const filterDisplay = createFilterDisplay(linkedinFilters);

            return res.status(200).json({
                success: true,
                linkedinFilters: linkedinFilters,
                filterDisplay: filterDisplay,
                geographyDetected: parsedInfo.hasGeographyMention
            });
        } catch (parseError) {
            console.error('Error parsing LinkedIn filters JSON:', parseError);
            return res.status(500).json({
                error: 'Failed to parse generated LinkedIn filters',
                rawResponse: responseContent
            });
        }
    } catch (error) {
        console.error('Error generating LinkedIn filters:', error);
        return res.status(500).json({ 
            error: error.message,
        });
    }
};

/**
 * Launch LinkedIn Sales Navigator with generated filters
 */
exports.launchSalesNavigator = async (req, res) => {
    try {
        const { input } = req.body.variables;
        const { personaIds, linkedinSalesNavigatorFilters } = input;

        // Validate required fields
        if (!personaIds || !personaIds.length || !linkedinSalesNavigatorFilters) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // For debugging
        console.log('Received filters:', JSON.stringify(linkedinSalesNavigatorFilters, null, 2));

        // Format data for the request
        const formattedFilters = formatFiltersForLinkedIn(linkedinSalesNavigatorFilters);

        // Process keywords
        if (linkedinSalesNavigatorFilters.keywords && linkedinSalesNavigatorFilters.keywords.length > 0) {
            // Keep keywords as a separate string in the format LinkedIn expects
            formattedFilters.keywords = linkedinSalesNavigatorFilters.keywords;
        }

        // Process Company HQ Locations
        if (formattedFilters.companyHQLocations && formattedFilters.companyHQLocations.length > 0) {
            console.log('Company HQ filters:', JSON.stringify(formattedFilters.companyHQLocations, null, 2));

            // Format Company HQ locations properly with region IDs when possible
            formattedFilters.companyHQLocations = formattedFilters.companyHQLocations.map(hq => {
                if (typeof hq === 'string') {
                    // Add known region IDs for common regions
                    const regionIdMapping = {
                        "South America": "104514572",
                        "North America": "102221843",
                        "Europe": "100506914",
                        "Asia": "102393603",
                        "Africa": "103537801",
                        "Oceania": "101452733",
                        "DACH": "91000007"
                    };

                    const id = regionIdMapping[hq] || '';
                    if (id) {
                        return { id, label: hq };
                    }
                    return { label: hq };
                }
                return hq;
            });
        }

        // Process Geography
        if (formattedFilters.geographies && formattedFilters.geographies.length > 0) {
            console.log('Geography filters:', JSON.stringify(formattedFilters.geographies, null, 2));

            // Check if we're dealing with regions
            const hasRegion = formattedFilters.geographies.some(geo => {
                const geoText = typeof geo === 'string' ? geo : (geo.text || geo.label || '');
                return ["South America", "North America", "Europe", "Asia", "Africa", "Oceania", "EMEA", "DACH", "APAC", "APJ", "MENA"].includes(geoText);
            });

            // Format with region IDs when possible
            formattedFilters.geographies = formattedFilters.geographies.map(geo => {
                if (typeof geo === 'string') {
                    // Add known region IDs for common regions
                    const regionIdMapping = {
                        "South America": "104514572",
                        "North America": "102221843",
                        "Europe": "100506914",
                        "Asia": "102393603",
                        "Africa": "103537801",
                        "Oceania": "101452733",
                        "United States": "103644278",
                        "EMEA": "91000006"
                    };

                    const id = regionIdMapping[geo] || '';
                    if (id) {
                        // For recognized regions, we need both the region ID and text
                        return {
                            id,
                            text: geo,
                            selectionType: "INCLUDED",
                            isRegion: hasRegion
                        };
                    }
                    return {
                        text: geo,
                        selectionType: "INCLUDED"
                    };
                }
                return {
                    ...geo,
                    isRegion: hasRegion
                };
            });
        }

        // Process Company Headcount
        if (formattedFilters.companyHeadCounts && formattedFilters.companyHeadCounts.length > 0) {
            console.log('Company Headcount filters:', JSON.stringify(formattedFilters.companyHeadCounts, null, 2));

            // Format headcount options with LinkedIn IDs
            formattedFilters.companyHeadCounts = formattedFilters.companyHeadCounts.map(hc => {
                const cleanHeadcount = typeof hc === 'string' ? hc : (hc.label || '');
                const id = mapHeadcountToLinkedInId(cleanHeadcount);

                return {
                    id,
                    label: cleanHeadcount
                };
            });
        }

        // Generate LinkedIn Sales Navigator URL
        const salesNavigatorUrl = generateSalesNavigatorUrl(formattedFilters);

        // Return response in the expected format
        const response = {
            data: {
                upsertAutopilotCuratedSearch: {
                    success: true,
                    autopilotCuratedSearch: {
                        id: Date.now(),
                        linkedinSalesNavigatorCuratedSearch: {
                            url: salesNavigatorUrl,
                            __typename: "LinkedinSalesNavigatorCuratedSearch"
                        },
                        __typename: "AutopilotCuratedSearch"
                    },
                    __typename: "AutopilotCuratedSearchResponse"
                }
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error generating Sales Navigator URL:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate Sales Navigator URL',
            error: error.message
        });
    }
};