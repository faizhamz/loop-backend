const mongoose = require('mongoose');

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
  addresses: [{
    name: String,
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
    isDefault: { type: Boolean, default: false }
  }],
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  coupons: [{
    code: String,
    discountPercent: Number,
    discountAmount: Number,
    used: { type: Boolean, default: false },
    usedAt: Date,
    expiresAt: Date
  }],
  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  totalSpent: { type: Number, default: 0 },
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
  if (!this.refId) {
    const count = await mongoose.model('User').countDocuments();
    const namePart = this.name ? this.name.substring(0, 4).toUpperCase() : 'USER';
    this.refId = `LOOP-${namePart}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);