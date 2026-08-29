const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'fixed', 'shipping'], default: 'percentage' },
  discountValue: { type: Number, required: true },
  
  // ✅ NEW: Max discount for percentage coupons
  maxDiscount: { type: Number, default: 0, min: 0 },
  
  minOrderValue: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [String],
  excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  
  // ✅ User specific
  userSpecific: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String, default: '' }, // ✅ For admin search
  userName: { type: String, default: '' },  // ✅ For admin search
  userPhone: { type: String, default: '' }, // ✅ For admin search
  
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

// ✅ Index for faster user search
couponSchema.index({ userId: 1 });
couponSchema.index({ userEmail: 1 });
couponSchema.index({ userName: 1 });
couponSchema.index({ userPhone: 1 });

module.exports = mongoose.model('Coupon', couponSchema);