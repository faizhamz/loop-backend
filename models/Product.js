const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  stock: { type: Number, required: true, default: 0 },
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  category: { type: String, default: 'Uncategorized' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);