const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // 🔥 NEW: Product ID (e.g., LOOP0001)
  productId: {
    type: String,
    unique: true,
    required: true
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  stock: { type: Number, required: true, default: 0 },
  image: { type: String, default: '' },
  images: [{ type: String }], // Multiple images for product page
  description: { type: String, default: '' },
  category: { type: String, default: 'Uncategorized' },
  size: { type: String, enum: ['S', 'M', 'L', 'XL', 'XXL'], default: 'M' },
  color: { type: String, default: 'Black' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// 🔥 Auto-generate productId before saving
productSchema.pre('save', async function(next) {
  if (!this.productId) {
    const count = await mongoose.model('Product').countDocuments();
    const paddedNumber = String(count + 1).padStart(4, '0');
    this.productId = `LOOP${paddedNumber}`;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);