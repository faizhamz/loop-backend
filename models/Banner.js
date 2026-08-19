const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  image: { type: String, required: true },
  imageMobile: { type: String, default: '' },
  
  // Navigation
  linkType: { 
    type: String, 
    enum: ['product', 'category', 'tag', 'custom', 'external'],
    default: 'product'
  },
  linkValue: { type: String, required: true },
  
  // Banner Type for styling
  bannerType: {
    type: String,
    enum: ['flash-sale', 'new-launch', 'festival-sale', 'bank-offer', 'clearance', 'featured', 'custom'],
    default: 'featured'
  },
  
  // Display Settings
  priority: { type: Number, default: 0 },
  autoplaySpeed: { type: Number, default: 5000 },
  
  // Schedule
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  
  // Status
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  isExpired: { type: Boolean, default: false },
  expiredAt: { type: Date, default: null },
  
  // Analytics
  totalClicks: { type: Number, default: 0 },
  uniqueClickers: { type: Number, default: 0 },
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

// Auto-expire banner when endDate passes
bannerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  if (this.endDate && new Date() > new Date(this.endDate)) {
    this.isExpired = true;
    this.isActive = false;
    this.expiredAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Banner', bannerSchema);