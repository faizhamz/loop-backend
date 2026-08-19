const mongoose = require('mongoose');

const variantOptionSchema = new mongoose.Schema({
  value: { type: String, required: true },
  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  sku: { type: String, unique: true, sparse: true }
});

const variantSchema = new mongoose.Schema({
  type: { type: String, required: true }, // "Size", "Color", "Engine", etc.
  name: { type: String, required: true },
  options: [variantOptionSchema]
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
  
  // Images with multiple sizes
  image: { type: String, default: '' },
  images: [{ type: String }],
  thumbnail: { type: String, default: '' },
  medium: { type: String, default: '' },
  large: { type: String, default: '' },
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
  
  // Dynamic variants
  variants: [variantSchema],
  hasVariants: { type: Boolean, default: false },
  
  // Sales tracking
  totalSold: { type: Number, default: 0 },
  
  // Analytics
  totalViews: { type: Number, default: 0 },
  uniqueViewers: { type: Number, default: 0 },
  
  // Review stats
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate productId
productSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  if (!this.productId) {
    const count = await mongoose.model('Product').countDocuments();
    const paddedNumber = String(count + 1).padStart(4, '0');
    this.productId = `LOOP${paddedNumber}`;
  }
  // Calculate total stock from variants if hasVariants
  if (this.hasVariants && this.variants.length > 0) {
    let totalStock = 0;
    this.variants.forEach(variant => {
      variant.options.forEach(opt => {
        totalStock += opt.stock || 0;
      });
    });
    this.stock = totalStock;
  }
  next();
});

// Indexes
productSchema.index({ productId: 1 }, { unique: true, sparse: true });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema);