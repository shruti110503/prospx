const mongoose = require('mongoose');

const seoSchema = new mongoose.Schema({
  pageId: {
    type: String,
    required: true,
    unique: true,
    enum: ['home', 'about', 'product', 'pricing', 'contact']
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  keywords: {
    type: [String],
    default: []
  },
  ogImage: {
    type: String
  },
  canonical: {
    type: String
  }
}, { timestamps: true });

const SEO = mongoose.model('SEO', seoSchema);

module.exports = SEO;