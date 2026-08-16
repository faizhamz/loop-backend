const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' },
  phone: { type: String },
  landmark: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
  label: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' }
});

const userSchema = new mongoose.Schema({
  refId: { type: String, unique: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: { type: String },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // Wallet
  wallet: {
    balance: { type: Number, default: 0 },
    transactions: [{
      amount: Number,
      type: { type: String, enum: ['credit', 'debit', 'refund', 'reward'] },
      description: String,
      expiresAt: Date,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  
  // NEW: Addresses (multiple)
  addresses: [addressSchema],
  
  // Wishlist
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  
  // Coupons
  coupons: [{
    code: String,
    discountPercent: Number,
    discountAmount: Number,
    used: { type: Boolean, default: false },
    usedAt: Date,
    expiresAt: Date
  }],
  
  // Order references
  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  totalSpent: { type: Number, default: 0 },
  
  // Review references (NEW)
  reviewIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  
  lastLogin: Date,
  loginHistory: [{
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Generate refId before saving
userSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  if (!this.refId) {
    const count = await mongoose.model('User').countDocuments();
    const namePart = this.name ? this.name.substring(0, 4).toUpperCase() : 'USER';
    this.refId = `LOOP-${namePart}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);