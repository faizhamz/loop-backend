const express = require('express');
const mongoose = require('mongoose');  // ✅ ADD THIS
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
    const orderId = req.params.id;
    
    // ✅ Check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }
    
    const order = await Order.findById(orderId);
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
    console.log('📦 Fetching orders for user:', userId);
    
    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .select('-paymentMethod -couponCode');
    
    console.log('📦 Orders found:', orders.length);
    res.json(orders);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get order by orderId (LOOP-001)
router.get('/order/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
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
    
    const userId = req.userId || null;
    const orderData = { ...req.body, orderId };
    if (userId) {
      orderData.userId = userId;
    }
    
    const order = new Order(orderData);
    await order.save();
    
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $push: { orderIds: order._id },
        $inc: { totalSpent: order.total }
      });
    }
    
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { totalSold: item.quantity }
      });
    }
    
    res.status(201).json(order);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Update order status (admin)
router.put('/:id', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
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
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit post-order rating
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

// Cancel order (within 1 hour)
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

// Update order status with timeline (admin)
router.put('/admin/:id/status', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
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

// Get order timeline
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

// ✅ Add tracking to order (admin)
router.post('/:id/tracking', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { trackingNumber, courier, courierName, trackingUrl } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.tracking = {
      number: trackingNumber,
      courier: courier || 'other',
      courierName: courierName || '',
      url: trackingUrl || '',
      updatedAt: new Date()
    };

    if (order.status === 'processing') {
      order.status = 'shipped';
      order.timeline.push({
        status: 'shipped',
        description: `Order shipped via ${courierName || courier} - Tracking: ${trackingNumber}`,
        timestamp: new Date()
      });
    }

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get invoice (admin)
router.get('/:id/invoice', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // For now, return order data. Full PDF generation can be added later.
    res.json({
      message: 'Invoice data',
      orderId: order.orderId,
      total: order.total,
      items: order.items
    });
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;