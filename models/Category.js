const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: '📁' },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  
  // Product type for this category
  productType: {
    type: String,
    enum: ['clothing', 'toys', 'electronics', 'accessories', 'home', 'stationery', 'other'],
    default: 'clothing'
  }
}, {
  timestamps: true
});

// Auto-generate slug from name
categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);