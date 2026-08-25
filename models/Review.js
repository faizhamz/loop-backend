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
  },
  
  // Review content
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 5 
  },
  title: { type: String, default: '' },
  comment: { type: String, default: '' },
  
  // Images in review
  images: [{ type: String }],
  
  // Verification
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  isApproved: { 
    type: Boolean, 
    default: true 
  },
  
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

module.exports = mongoose.model('Review', reviewSchema);