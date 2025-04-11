// server/config/index.js
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Determine which .env file to use based on NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envPath = path.resolve(process.cwd(), envFile);

// Check if the file exists
if (fs.existsSync(envPath)) {
  console.log(`Loading environment from ${envFile}`);
  dotenv.config({ path: envPath });
} else {
  // Fallback to default .env
  console.log(`${envFile} not found, falling back to .env`);
  dotenv.config();
}

module.exports = {
  // Server configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  
  // MongoDB configuration
  mongoUri: process.env.MONGO_URI,
  
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET,
  
  // API keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  apolloApiKey: process.env.APOLLO_API_KEY,
  apolloApiUrl: process.env.APOLLO_API_URL,
  hunterApiUrl: process.env.HUNTER_API_URL,
  hunterApiKey: process.env.HUNTER_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  
  // OAuth configurations
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleServerKey: process.env.GOOGLE_SERVER_KEY,
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID,
  stripSecretKey: process.env.STRIPE_SECRET_KEY,
  clientUrl: process.env.CLIENT_URL,
  stripeWebHookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  linkedinRedirectUri: process.env.LINKEDIN_REDIRECT_URI,
  
  // Validate required environment variables
  validateEnv: () => {
    const requiredEnvVars = [
      'MONGO_URI',
      'JWT_SECRET',
      'ANTHROPIC_API_KEY',
      'APOLLO_API_KEY',
      'STRIPE_SECRET_KEY',
      'CLIENT_URL',
      'STRIPE_WEBHOOK_SECRET',
      'APOLLO_API_URL',
      'GEMINI_API_KEY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_SERVER_KEY',
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'LINKEDIN_REDIRECT_URI'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.error('Missing required environment variables:');
      missingEnvVars.forEach(envVar => console.error(`  - ${envVar}`));
      return false;
    }
    
    return true;
  }
};