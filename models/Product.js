const mongoose = require('mongoose');

// ✅ NEW: FAQ Schema
const faqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  order: { type: Number, default: 0 }
});

const productSchema = new mongoose.Schema({
  productId: { 
    type: String, 
    unique: true,
    required: true,
    default: function() {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `LOOP-${timestamp}${random}`;
    }
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  stock: { type: Number, required: true, default: 0 },
  image: { type: String, default: '' },
  images: [{ type: String, default: [] }],
  videos: [{ type: String, default: [] }],
  description: { type: String, default: '' },
  
  // Category as string (main category)
  category: { type: String, default: 'Uncategorized' },
  
  // Categories as array of ObjectIds (for multiple categories)
  categories: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    default: []
  }],
  
  color: { type: String, default: 'Black' },
  size: { type: String, default: 'M' },
  
  // Variants
  hasVariants: { type: Boolean, default: false },
  variants: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    options: [{
      value: { type: String, required: true },
      price: { type: Number, default: 0 },
      stock: { type: Number, default: 0 }
    }]
  }],
  
  // ✅ NEW: FAQs
  faqs: [faqSchema],
  
  // Ratings
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  totalSold: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  
  // Status
  isActive: { type: Boolean, default: true },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'draft'], 
    default: 'active' 
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Add indexes for better performance
productSchema.index({ productId: 1 }, { unique: true });
productSchema.index({ category: 1 });
productSchema.index({ categories: 1 });
productSchema.index({ name: 'text' });

// Virtual for display price
productSchema.virtual('displayPrice').get(function() {
  return this.salePrice && this.salePrice < this.price ? this.salePrice : this.price;
});

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);