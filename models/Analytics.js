const mongoose = require('mongoose');

// Daily aggregated analytics
const dailyAnalyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    default: () => new Date().setHours(0, 0, 0, 0)
  },
  uniqueVisitors: {
    type: Number,
    default: 0
  },
  productViews: {
    type: Map,
    of: Number,
    default: {}
  },
  bannerClicks: {
    type: Map,
    of: Number,
    default: {}
  }
}, {
  timestamps: true
});

// Event logs for detailed analysis
const analyticsEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['product_view', 'banner_click', 'visitor'],
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  bannerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    required: false
  },
  visitorId: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sessionId: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for faster queries
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ productId: 1, timestamp: -1 });
analyticsEventSchema.index({ bannerId: 1, timestamp: -1 });
analyticsEventSchema.index({ visitorId: 1, timestamp: -1 });

module.exports = {
  DailyAnalytics: mongoose.model('DailyAnalytics', dailyAnalyticsSchema),
  AnalyticsEvent: mongoose.model('AnalyticsEvent', analyticsEventSchema)
};