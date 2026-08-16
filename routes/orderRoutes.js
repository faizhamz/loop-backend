const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all orders (admin)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order by ID (admin)
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTHENTICATED USER ROUTES
// ============================================

// Get user's order history
router.get('/my-orders', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login to view orders' });
    }
    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .select('-paymentMethod -couponCode');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order with details
router.get('/my-orders/:orderId', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please login to view order' });
    }
    const order = await Order.findOne({ orderId: req.params.orderId, userId })
      .populate('items.productId', 'name image productId');
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    const orderCount = await Order.countDocuments();
    const orderId = `LOOP-${String(orderCount + 1).padStart(3, '0')}`;
    
    // If user is logged in, add userId
    const userId = req.userId || null;
    const orderData = { ...req.body, orderId };
    if (userId) {
      orderData.userId = userId;
    }
    
    const order = new Order(orderData);
    await order.save();
    
    // Update user's order list if logged in
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $push: { orderIds: order._id },
        $inc: { totalSpent: order.total }
      });
    }
    
    // Update product totalSold
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { totalSold: item.quantity }
      });
    }
    
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update order status (admin)
router.put('/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id, 
      { status: req.body.status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete order (admin)
router.delete('/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// NEW: Submit post-order rating
// ============================================
router.post('/:orderId/rate', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Please login to rate' });
    }
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Please provide a valid rating (1-5)' });
    }
    
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.postOrderRating) {
      return res.status(400).json({ error: 'You have already rated this order' });
    }
    
    order.postOrderRating = rating;
    order.postOrderComment = comment || '';
    order.postOrderRatedAt = new Date();
    await order.save();
    
    res.json({ 
      success: true, 
      message: 'Thank you for your feedback!',
      order 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// NEW: Cancel order (within 1 hour)
// ============================================
router.post('/:orderId/cancel', async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Please login to cancel order' });
    }
    
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if order can be cancelled (within 1 hour of placing)
    const now = new Date();
    const orderTime = new Date(order.createdAt);
    const diffMinutes = (now - orderTime) / (1000 * 60);
    
    if (diffMinutes > 60) {
      return res.status(400).json({ error: 'Order can only be cancelled within 1 hour of placing' });
    }
    
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Order cannot be cancelled in its current state' });
    }
    
    order.status = 'cancelled';
    order.timeline.push({
      status: 'cancelled',
      description: 'Order cancelled by customer',
      timestamp: new Date()
    });
    await order.save();
    
    res.json({ message: 'Order cancelled successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// NEW: Update order status with timeline (admin)
// ============================================
router.put('/admin/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const statusDescriptions = {
      'processing': 'Order is being processed',
      'shipped': 'Order has been shipped',
      'delivered': 'Order has been delivered',
      'cancelled': 'Order was cancelled',
      'returned': 'Order was returned'
    };
    
    order.status = status;
    order.timeline.push({
      status,
      description: statusDescriptions[status] || `Order status updated to ${status}`,
      timestamp: new Date()
    });
    await order.save();
    
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// NEW: Get order timeline
// ============================================
router.get('/:orderId/timeline', async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order.timeline || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;