const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  size: { type: String, default: 'M' },
  color: { type: String, default: 'Black' },
  isReviewed: { type: Boolean, default: false }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      landmark: String
    }
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  shipping: { type: Number, default: 60 },
  discount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['upi', 'razorpay'], default: 'upi' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'], 
    default: 'pending' 
  },
  
  // ✅ Tracking Information
  tracking: {
    number: { type: String, default: '' },
    courier: { type: String, enum: ['delhivery', 'bluedart', 'dtdc', 'xpressbees', 'other', ''], default: '' },
    courierName: { type: String, default: '' },
    url: { type: String, default: '' },
    updatedAt: { type: Date, default: null }
  },
  
  // ✅ Payment Details (for Razorpay)
  paymentDetails: {
    razorpay_payment_id: { type: String, default: '' },
    razorpay_order_id: { type: String, default: '' },
    razorpay_signature: { type: String, default: '' },
    capturedAt: { type: Date, default: null }
  },
  
  timeline: [{
    status: String,
    description: String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  postOrderRating: { type: Number, min: 1, max: 5 },
  postOrderComment: { type: String, default: '' },
  postOrderRatedAt: { type: Date },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate orderId
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (!this.orderId) {
    const date = new Date();
    const prefix = `LOOP-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    this.orderId = `${prefix}-${String(Math.floor(100000 + Math.random() * 900000))}`;
  }
  if (this.isNew) {
    this.timeline = [{
      status: 'pending',
      description: 'Order placed successfully',
      timestamp: new Date()
    }];
  }
  next();
});

// ✅ Method to update status with timeline
orderSchema.methods.updateStatus = function(newStatus, description = '') {
  const validTransitions = {
    'pending': ['processing', 'cancelled'],
    'processing': ['shipped', 'cancelled'],
    'shipped': ['delivered', 'cancelled'],
    'delivered': ['returned'],
    'cancelled': [],
    'returned': []
  };
  
  if (!validTransitions[this.status]?.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${this.status} → ${newStatus}`);
  }
  
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    description: description || `Order ${newStatus}`,
    timestamp: new Date()
  });
  
  return this.save();
};

// Indexes
orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ userId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

// ✅ Prevent model overwrite error
module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);