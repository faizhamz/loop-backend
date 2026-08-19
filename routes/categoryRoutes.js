const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 });
    
    // Get product count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const count = await Product.countDocuments({
          categories: category._id,
          isActive: true
        });
        return {
          ...category.toObject(),
          productCount: count
        };
      })
    );
    
    res.json(categoriesWithCount);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single category by slug
router.get('/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ 
      slug: req.params.slug,
      isActive: true 
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Get products in this category
    const products = await Product.find({
      categories: category._id,
      isActive: true
    }).sort({ createdAt: -1 });
    
    res.json({
      category,
      products,
      productCount: products.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all categories (admin)
router.get('/admin/all', async (req, res) => {
  try {
    const categories = await Category.find()
      .sort({ displayOrder: 1, name: 1 });
    
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const count = await Product.countDocuments({
          categories: category._id,
          isActive: true
        });
        return {
          ...category.toObject(),
          productCount: count
        };
      })
    );
    
    res.json(categoriesWithCount);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create category (admin)
router.post('/', async (req, res) => {
  try {
    const { name, image, description, icon, displayOrder } = req.body;
    
    // Check if category already exists
    const existing = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    const category = new Category({
      name,
      image: image || '',
      description: description || '',
      icon: icon || '📁',
      displayOrder: displayOrder || 0,
      isActive: true
    });
    
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update category (admin)
router.put('/:id', async (req, res) => {
  try {
    const { name, image, description, icon, displayOrder, isActive } = req.body;
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Update fields
    if (name) category.name = name;
    if (image !== undefined) category.image = image;
    if (description !== undefined) category.description = description;
    if (icon) category.icon = icon;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;
    
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete category (admin)
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Remove category from all products
    await Product.updateMany(
      { categories: category._id },
      { $pull: { categories: category._id } }
    );
    
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder categories (admin)
router.put('/admin/reorder', async (req, res) => {
  try {
    const { categories } = req.body; // Array of { id, displayOrder }
    
    for (const item of categories) {
      await Category.findByIdAndUpdate(item.id, {
        displayOrder: item.displayOrder
      });
    }
    
    res.json({ message: 'Categories reordered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get category analytics (admin)
router.get('/admin/analytics', async (req, res) => {
  try {
    const total = await Category.countDocuments();
    const active = await Category.countDocuments({ isActive: true });
    
    const topCategories = await Category.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'categories',
          as: 'products'
        }
      },
      {
        $project: {
          name: 1,
          productCount: { $size: '$products' }
        }
      },
      { $sort: { productCount: -1 } },
      { $limit: 5 }
    ]);
    
    res.json({
      total,
      active,
      inactive: total - active,
      topCategories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;