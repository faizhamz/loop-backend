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
  
  // ✅ NEW: Product type for this category
  productType: {
    type: String,
    enum: ['clothing', 'toys', 'electronics', 'accessories', 'home', 'stationery', 'other'],
    default: 'clothing'
  }
}, {
  timestamps: true
});

// ✅ Generate slug from name
categorySchema.pre('save', function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')   // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-')            // Replace spaces with -
      .replace(/-+/g, '-')             // Replace multiple - with single -
      .replace(/^-|-$/g, '');          // Remove leading/trailing -
    
    // If slug is empty after cleaning, use a fallback
    if (!this.slug) {
      this.slug = `category-${Date.now()}`;
    }
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);