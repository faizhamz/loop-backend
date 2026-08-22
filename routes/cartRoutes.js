const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ✅ GET user's cart from database
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.json({ items: [] });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ items: [] });
    }
    
    res.json({ items: user.cart || [] });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Sync cart with database
router.post('/sync', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login to sync cart' });
    }
    
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid cart items' });
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { cart: items },
      { new: true }
    );
    
    res.json({ 
      success: true, 
      items: user.cart || [],
      message: 'Cart synced successfully'
    });
  } catch (error) {
    console.error('Cart sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Add item to cart
router.post('/add', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login to add to cart' });
    }
    
    const { productId, name, price, image, size, quantity } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.cart) {
      user.cart = [];
    }
    
    const existingIndex = user.cart.findIndex(
      item => item.productId === productId && item.size === size
    );
    
    if (existingIndex > -1) {
      user.cart[existingIndex].quantity += quantity || 1;
    } else {
      user.cart.push({
        productId,
        name,
        price,
        image,
        size,
        quantity: quantity || 1
      });
    }
    
    await user.save();
    res.json({ success: true, items: user.cart });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Remove item from cart
router.delete('/remove/:productId', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login' });
    }
    
    const { productId } = req.params;
    const { size } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.cart = user.cart.filter(
      item => !(item.productId === productId && item.size === size)
    );
    
    await user.save();
    res.json({ success: true, items: user.cart });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Clear cart after order
router.delete('/clear', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login' });
    }
    
    await User.findByIdAndUpdate(userId, { cart: [] });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;