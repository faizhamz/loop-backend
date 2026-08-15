const mongoose = require('mongoose');

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
  description: { type: String, default: '' },
  category: { type: String, default: 'Uncategorized' },
  color: { type: String, default: 'Black' },
  size: { type: String, enum: ['S', 'M', 'L', 'XL', 'XXL'], default: 'M' },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'discontinued'], 
    default: 'active' 
  },
  isActive: { type: Boolean, default: true },
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
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
  next();
});

// Ensure productId is unique
productSchema.index({ productId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Product', productSchema);