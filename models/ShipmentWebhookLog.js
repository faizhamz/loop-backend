const mongoose = require('mongoose');

const shipmentWebhookLogSchema = new mongoose.Schema({
  awb: { type: String, index: true },
  currentStatus: { type: String },
  currentStatusCode: { type: Number },
  payload: { type: mongoose.Schema.Types.Mixed },
  processed: { type: Boolean, default: false },
  error: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now }
});

// Auto-delete logs older than 30 days
shipmentWebhookLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ShipmentWebhookLog', shipmentWebhookLogSchema);