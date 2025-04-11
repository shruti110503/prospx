const mongoose = require("mongoose");

const connectDB = async (mongoUri) => {
  try {
    console.log("📊 Connecting to MongoDB...");
    
    // Connect using the URI passed from config
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`📊 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;