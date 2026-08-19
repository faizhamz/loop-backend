const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  size: { 
    type: String, 
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'], 
    default: 'M' 
  },
  color: { type: String, default: 'Black' },
  stock: { type: Number, required: true, default: 0 },
  sku: { type: String, unique: true, sparse: true },
  price: { type: Number },
  salePrice: { type: Number },
  isActive: { type: Boolean, default: true }
});

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  stock: { type: Number, required: true, default: 0 },
  image: { type: String, default: '' },
  images: [{ type: String }],
  videos: [{ type: String }],
  description: { type: String, default: '' },
  category: { type: String, default: 'Uncategorized' },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  color: { type: String, default: 'Black' },
  size: { type: String, enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'], default: 'M' },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'discontinued'], 
    default: 'active' 
  },
  isActive: { type: Boolean, default: true },
  
  // Variants
  variants: [variantSchema],
  hasVariants: { type: Boolean, default: false },
  
  // Sales tracking
  totalSold: { type: Number, default: 0 },
  
  // ✅ ANALYTICS FIELDS - ADD THESE
  totalViews: { type: Number, default: 0 },
  uniqueViewers: { type: Number, default: 0 },
  
  // Review stats
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate productId if not provided
productSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  if (!this.productId) {
    const count = await mongoose.model('Product').countDocuments();
    const paddedNumber = String(count + 1).padStart(4, '0');
    this.productId = `LOOP${paddedNumber}`;
  }
  // Calculate total stock from variants if hasVariants
  if (this.hasVariants && this.variants.length > 0) {
    this.stock = this.variants.reduce((sum, v) => sum + v.stock, 0);
  }
  next();
});

// Indexes
productSchema.index({ productId: 1 }, { unique: true, sparse: true });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema);