const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  image: { type: String, required: true }, // Cloudinary URL
  imageMobile: { type: String, default: '' }, // Optional mobile-specific image
  
  // Navigation
  linkType: { 
    type: String, 
    enum: ['product', 'category', 'tag', 'custom', 'external'],
    default: 'product'
  },
  linkValue: { type: String, required: true }, // e.g., productId or URL
  
  // Banner Type for styling
  bannerType: {
    type: String,
    enum: ['flash-sale', 'new-launch', 'festival-sale', 'bank-offer', 'clearance', 'featured', 'custom'],
    default: 'featured'
  },
  
  // Display Settings
  priority: { type: Number, default: 0 }, // Higher = shows first
  autoplaySpeed: { type: Number, default: 5000 }, // milliseconds (5 seconds default)
  
  // Schedule
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null }, // null = never expires
  
  // Status
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  
  // Analytics
  clicks: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Virtual: Check if banner is currently active
bannerSchema.virtual('isCurrentlyActive').get(function() {
  if (!this.isActive || this.isDeleted) return false;
  const now = new Date();
  if (this.startDate && now < this.startDate) return false;
  if (this.endDate && now > this.endDate) return false;
  return true;
});

// Virtual: Get formatted time remaining
bannerSchema.virtual('timeRemaining').get(function() {
  if (!this.endDate) return null;
  const now = new Date();
  const diff = this.endDate - now;
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
});

module.exports = mongoose.model('Banner', bannerSchema);