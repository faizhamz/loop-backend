const mongoose = require('mongoose');

const utmTrackingSchema = new mongoose.Schema({
  visitorId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  utm_source: { type: String },
  utm_medium: { type: String },
  utm_campaign: { type: String },
  utm_term: { type: String },
  utm_content: { type: String },
  sessionId: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Index for faster queries
utmTrackingSchema.index({ timestamp: -1 });
utmTrackingSchema.index({ visitorId: 1, timestamp: -1 });

module.exports = mongoose.model('UTMTracking', utmTrackingSchema);