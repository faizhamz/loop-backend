const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['info', 'success', 'warning', 'error'], 
    default: 'info' 
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  targetType: {
    type: String,
    enum: ['all', 'logged-in', 'guest', 'specific'],
    default: 'all'
  },
  targetUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // ✅ For specific users
  link: { type: String, default: '' },
  isDismissible: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  publishDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // ✅ Track who read it
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
notificationSchema.index({ isActive: 1, isDeleted: 1, publishDate: 1, expiryDate: 1 });

module.exports = mongoose.model('Notification', notificationSchema);