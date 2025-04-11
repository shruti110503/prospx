const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Generates an SVG avatar with the given initials
 * @param {string} initials - The initials to display in the avatar
 * @returns {string} - The path to the avatar file
 */
const generateAvatar = (initials) => {
    try {
        // Generate a unique ID for the avatar
        const uniqueId = crypto.randomBytes(8).toString("hex");
        const fileName = `${uniqueId}.svg`;

        // Ensure avatars folder exists
        const avatarsFolder = path.join(__dirname, "../public/avatars");
        if (!fs.existsSync(avatarsFolder)) {
            fs.mkdirSync(avatarsFolder, { recursive: true });
        }
        
        // Use dark brown/black color to match the "Install Extension" button
        const bgColor = "#1A0A0A"; // Dark brown/black color similar to the button in screenshot
        
        // Create SVG content
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${bgColor}" />
    <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" 
        fill="white" text-anchor="middle" dominant-baseline="central" text-transform="uppercase">
        ${initials}
    </text>
</svg>`;

        // Save the SVG file
        const filePath = path.join(avatarsFolder, fileName);
        fs.writeFileSync(filePath, svgContent);

        return `/avatars/${fileName}`;
    } catch (error) {
        console.error("Error generating avatar:", error);
        return "/avatars/default.svg"; // Fallback to default avatar
    }
};

module.exports = generateAvatar;