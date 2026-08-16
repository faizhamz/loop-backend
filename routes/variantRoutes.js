const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// ============================================
// ADMIN ROUTES - Manage variants
// ============================================

// Add variant to product
router.post('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { size, color, stock, price, salePrice } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check if variant already exists
    const existing = product.variants.find(v => v.size === size && v.color === color);
    if (existing) {
      return res.status(400).json({ error: 'Variant already exists' });
    }
    
    product.variants.push({ size, color, stock, price, salePrice });
    product.hasVariants = true;
    product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    await product.save();
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update variant
router.put('/product/:productId/variant/:variantId', async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const { size, color, stock, price, salePrice, isActive } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const variant = product.variants.id(variantId);
    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    if (size) variant.size = size;
    if (color) variant.color = color;
    if (stock !== undefined) variant.stock = stock;
    if (price) variant.price = price;
    if (salePrice !== undefined) variant.salePrice = salePrice;
    if (isActive !== undefined) variant.isActive = isActive;
    
    product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    await product.save();
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete variant
router.delete('/product/:productId/variant/:variantId', async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    product.variants = product.variants.filter(v => v._id.toString() !== variantId);
    product.hasVariants = product.variants.length > 0;
    product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    await product.save();
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;