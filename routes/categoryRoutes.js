const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');

// ============================================
// UTILITY FUNCTIONS
// ============================================

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
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

// ✅ UPDATED: Create category (admin)
router.post('/', async (req, res) => {
  try {
    const { name, image, description, icon, displayOrder } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // Check if category already exists (by name)
    const existing = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    // Auto-generate slug from name
    const slug = generateSlug(name);
    
    // Check for duplicate slug
    const existingSlug = await Category.findOne({ slug });
    if (existingSlug) {
      return res.status(400).json({ 
        error: 'A category with a similar name already exists' 
      });
    }
    
    const category = new Category({
      name: name.trim(),
      slug: slug,  // ⭐ AUTO-GENERATED
      image: image || '',
      description: description || '',
      icon: icon || '📁',
      displayOrder: displayOrder || 0,
      isActive: true
    });
    
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    console.error('Error creating category:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        error: 'Category with this name or slug already exists' 
      });
    }
    
    res.status(400).json({ error: err.message });
  }
});

// ✅ UPDATED: Update category (admin)
router.put('/:id', async (req, res) => {
  try {
    const { name, image, description, icon, displayOrder, isActive } = req.body;
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // If name is being updated, auto-generate new slug
    if (name && name.trim() !== '' && name !== category.name) {
      // Check for duplicate name
      const existing = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: category._id }
      });
      
      if (existing) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
      
      // Auto-generate new slug
      const slug = generateSlug(name);
      
      // Check for duplicate slug
      const existingSlug = await Category.findOne({ 
        slug,
        _id: { $ne: category._id }
      });
      
      if (existingSlug) {
        return res.status(400).json({ 
          error: 'A category with a similar name already exists' 
        });
      }
      
      category.name = name.trim();
      category.slug = slug;
    }
    
    // Update other fields
    if (image !== undefined) category.image = image;
    if (description !== undefined) category.description = description;
    if (icon) category.icon = icon;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;
    
    await category.save();
    res.json(category);
  } catch (err) {
    console.error('Error updating category:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        error: 'Category with this name or slug already exists' 
      });
    }
    
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
    const { categories } = req.body;
    
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