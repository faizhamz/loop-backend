const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Notification = require('../models/Notification');

// ============================================
// NOTIFICATION TEMPLATES
// ============================================
const statusTemplates = {
  pending: {
    icon: '⏳',
    message: 'Order #{orderId} has been placed and is pending confirmation. We\'ll notify you once it\'s processed.'
  },
  processing: {
    icon: '🔄',
    message: 'Order #{orderId} is being processed. We\'re carefully preparing your items! 🎁'
  },
  shipped: {
    icon: '🚚',
    message: '🎉 Order #{orderId} has been shipped! Track your package and get ready to receive your goodies.'
  },
  delivered: {
    icon: '✅',
    message: '📦 Order #{orderId} has been delivered! We hope you love your purchase. Share your experience with a review! ⭐'
  },
  cancelled: {
    icon: '❌',
    message: 'Order #{orderId} has been cancelled. If this was a mistake, please contact our support team.'
  },
  returned: {
    icon: '↩️',
    message: 'Order #{orderId} has been returned. Your refund will be processed within 3-5 business days.'
  }
};

// ============================================
// Helper: Send order status notification
// ============================================
const sendOrderStatusNotification = async (order, newStatus) => {
  try {
    const template = statusTemplates[newStatus];
    if (!template) return;
    
    const itemNames = order.items.slice(0, 3).map(i => i.name).join(', ');
    const extraItems = order.items.length > 3 ? ` +${order.items.length - 3} more` : '';
    const itemsList = `${itemNames}${extraItems}`;
    
    const message = template.message
      .replace('{orderId}', order.orderId)
      .replace('{items}', itemsList);
    
    // ✅ Create notification with link to order history
    const notification = new Notification({
      message: `${template.icon} ${message}`,
      type: newStatus === 'cancelled' || newStatus === 'returned' ? 'error' : 'success',
      priority: newStatus === 'shipped' || newStatus === 'delivered' ? 'high' : 'medium',
      targetType: 'specific',
      targetUserIds: order.userId ? [order.userId] : [],
      link: `/orders/${order.orderId}`,  // ✅ Link to order history page
      orderId: order._id,
      orderStatus: newStatus,
      isActive: true,
      isDismissible: true
    });
    
    await notification.save();
    console.log(`📧 Order notification sent for ${order.orderId}: ${newStatus}`);
    
    return notification;
  } catch (err) {
    console.error('Error sending order notification:', err);
    return null;
  }
};

// ============================================
// ✅ SPECIFIC ROUTES FIRST (BEFORE /:id)
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
      .populate('items.productId', 'name image productId avgRating');
    
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

// Get single order with details (user)
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
    
    // ✅ Send notification
    await sendOrderStatusNotification(order, 'cancelled');
    
    res.json({ message: 'Order cancelled successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ============================================
// ✅ PARAMETER ROUTES LAST (AFTER SPECIFIC ROUTES)
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

// Search orders (admin)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }
    
    const searchRegex = new RegExp(q.trim(), 'i');
    
    const orders = await Order.find({
      $or: [
        { orderId: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.email': searchRegex },
        { 'customer.phone': searchRegex },
        { 'customer.address.city': searchRegex },
        { 'customer.address.street': searchRegex }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50);
    
    res.json(orders);
  } catch (err) {
    console.error('Order search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single order by ID (admin) - MUST BE LAST
router.get('/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    
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
    
    // Handle wallet payment
    const { walletUsed = 0, useWallet = false } = req.body;
    let finalTotal = orderData.total || 0;
    let walletDeduction = 0;
    
    if (useWallet && userId) {
      const user = await User.findById(userId);
      if (user && user.wallet && user.wallet.balance > 0) {
        const availableBalance = user.wallet.balance;
        
        if (walletUsed > 0 && walletUsed <= availableBalance) {
          walletDeduction = Math.min(walletUsed, finalTotal);
          finalTotal = finalTotal - walletDeduction;
          
          user.wallet.balance -= walletDeduction;
          user.wallet.transactions.push({
            amount: -walletDeduction,
            type: 'debit',
            description: `Payment for order ${orderId}`,
            orderId: orderData._id || null,
            createdAt: new Date()
          });
          await user.save();
          
          orderData.walletUsed = walletDeduction;
          orderData.walletRemaining = user.wallet.balance;
          orderData.total = finalTotal;
          
        } else if (availableBalance >= finalTotal) {
          walletDeduction = finalTotal;
          finalTotal = 0;
          
          user.wallet.balance -= walletDeduction;
          user.wallet.transactions.push({
            amount: -walletDeduction,
            type: 'debit',
            description: `Full payment for order ${orderId}`,
            orderId: orderData._id || null,
            createdAt: new Date()
          });
          await user.save();
          
          orderData.walletUsed = walletDeduction;
          orderData.walletRemaining = user.wallet.balance;
          orderData.paymentStatus = 'paid';
          orderData.paymentMethod = 'wallet';
          orderData.total = 0;
        }
      }
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
    
    // Send notification for new order
    if (userId) {
      await sendOrderStatusNotification(order, 'pending');
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
    
    // Send notification on status change
    await sendOrderStatusNotification(order, req.body.status);
    
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
    
    // Send notification
    await sendOrderStatusNotification(order, status);
    
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add tracking to order (admin)
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
    
    // Send notification for shipped status
    await sendOrderStatusNotification(order, 'shipped');
    
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

    // ✅ Generate PDF invoice
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=invoice-${order.orderId}.pdf`,
        'Content-Length': pdfBuffer.length
      });
      res.send(pdfBuffer);
    });

    // Build invoice
    doc.fontSize(24).fillColor('#D4AF37').text('LOOP', { align: 'center' });
    doc.fontSize(14).fillColor('#888').text('Make your move', { align: 'center' }).moveDown();
    doc.fontSize(20).fillColor('#000').text('INVOICE', { align: 'center' }).moveDown();

    doc.fontSize(12).fillColor('#333');
    doc.text(`Order ID: ${order.orderId}`, { continued: true })
       .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(14).fillColor('#D4AF37').text('Customer Details');
    doc.fontSize(12).fillColor('#333');
    doc.text(`Name: ${order.customer?.name || 'Guest'}`);
    doc.text(`Email: ${order.customer?.email || 'N/A'}`);
    doc.text(`Phone: ${order.customer?.phone || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#D4AF37').text('Shipping Address');
    doc.fontSize(12).fillColor('#333');
    const addr = order.customer?.address;
    if (addr) {
      doc.text(`${addr.street || ''}`);
      doc.text(`${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`);
      if (addr.landmark) doc.text(`Landmark: ${addr.landmark}`);
    }
    doc.moveDown();

    doc.fontSize(14).fillColor('#D4AF37').text('Items Ordered');
    doc.fontSize(12).fillColor('#333');

    const tableTop = doc.y;
    doc.text('Item', 50, tableTop, { width: 200 });
    doc.text('Qty', 300, tableTop, { width: 50, align: 'center' });
    doc.text('Price', 400, tableTop, { width: 80, align: 'right' });
    doc.text('Total', 500, tableTop, { width: 80, align: 'right' });
    doc.moveDown();

    order.items.forEach((item) => {
      const y = doc.y;
      doc.text(item.name, 50, y, { width: 200 });
      doc.text(String(item.quantity), 300, y, { width: 50, align: 'center' });
      doc.text(`₹${item.price}`, 400, y, { width: 80, align: 'right' });
      doc.text(`₹${item.price * item.quantity}`, 500, y, { width: 80, align: 'right' });
      doc.moveDown();
    });

    doc.moveDown();
    const totalY = doc.y;
    
    doc.fontSize(12).fillColor('#555');
    doc.text(`Subtotal: ₹${order.subtotal}`, 400, totalY, { align: 'right' });
    doc.text(`Shipping: ${order.shipping === 0 ? 'FREE 🎉' : `₹${order.shipping}`}`, 400, doc.y + 20, { align: 'right' });
    
    if (order.platformFee > 0) {
      doc.text(`Platform Fee: ₹${order.platformFee}`, 400, doc.y + 20, { align: 'right' });
    } else {
      doc.text(`Platform Fee: FREE 🎉`, 400, doc.y + 20, { align: 'right' });
    }
    
    if (order.handlingFee > 0) {
      doc.text(`Handling Fee: ₹${order.handlingFee}`, 400, doc.y + 20, { align: 'right' });
    } else {
      doc.text(`Handling Fee: FREE 🎉`, 400, doc.y + 20, { align: 'right' });
    }
    
    if (order.discount > 0) {
      doc.text(`Discount: -₹${order.discount}`, 400, doc.y + 20, { align: 'right' });
    }
    if (order.couponDiscount > 0) {
      doc.text(`Coupon Discount: -₹${order.couponDiscount}`, 400, doc.y + 20, { align: 'right' });
    }
    
    doc.fontSize(16).fillColor('#D4AF37')
       .text(`Total: ₹${order.total}`, 400, doc.y + 20, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#888')
       .text('Thank you for shopping with LOOP!', { align: 'center' })
       .text('For support: support@loopstore.in | +91 98765 43210', { align: 'center' });

    doc.end();
    
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;