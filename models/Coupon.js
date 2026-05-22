const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'fixed', 'shipping'], default: 'percentage' },
  discountValue: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [String],
  excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  userSpecific: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstOrderOnly: { type: Boolean, default: false },
  usageLimit: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  usedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    usedAt: { type: Date, default: Date.now },
    discountAmount: Number
  }],
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Coupon', couponSchema);