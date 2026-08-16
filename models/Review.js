const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true 
  },
  orderItemId: { 
    type: mongoose.Schema.Types.ObjectId 
  }, // Track which order item was reviewed
  
  // Review content
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 5 
  },
  title: { type: String, default: '' },
  comment: { type: String, default: '' },
  
  // NEW: Images in review
  images: [{ type: String }],
  
  // Verification
  isVerified: { 
    type: Boolean, 
    default: false 
  }, // True if user purchased
  isApproved: { 
    type: Boolean, 
    default: true 
  }, // Admin approval
  
  // Helpful votes
  helpfulCount: { type: Number, default: 0 },
  
  // Admin flags
  isReported: { type: Boolean, default: false },
  reportReason: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure one review per product per order item
reviewSchema.index({ productId: 1, userId: 1, orderItemId: 1 }, { unique: true });

// Virtual: Check if review is from verified purchase
reviewSchema.virtual('isVerifiedPurchase').get(function() {
  return this.isVerified;
});

module.exports = mongoose.model('Review', reviewSchema);