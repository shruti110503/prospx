const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  siteName: {
    type: String,
    required: true,
    default: 'Lead Generation Platform'
  },
  logo: {
    type: String,
    default: '/logo.svg'
  },
  favicon: {
    type: String,
    default: '/favicon.ico'
  },
  primaryColor: {
    type: String,
    default: '#4f46e5'
  },
  secondaryColor: {
    type: String,
    default: '#6366f1'
  },
  contactEmail: {
    type: String,
    required: true,
    default: 'contact@example.com'
  },
  contactPhone: {
    type: String,
    default: '+1 (555) 123-4567'
  },
  address: {
    type: String,
    default: '123 Market Street, Suite 456, San Francisco, CA 94103'
  },
  socialLinks: {
    facebook: { type: String },
    twitter: { type: String },
    linkedin: { type: String },
    instagram: { type: String }
  },
  googleAnalyticsId: { type: String },
  isMaintenanceMode: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);

module.exports = SiteSettings;