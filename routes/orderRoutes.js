const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendStatusEmail } = require('../services/emailTemplates');
const { sendWhatsAppStatus } = require('../services/whatsappService');

// ============================================
// NOTIFICATION TEMPLATES
// ============================================
const statusTemplates = {
  pending: { icon: '⏳', message: 'Order #{orderId} has been placed and is pending confirmation.' },
  processing: { icon: '🔄', message: 'Order #{orderId} is being processed.' },
  shipped: { icon: '🚚', message: 'Order #{orderId} has been shipped! Track your package.' },
  delivered: { icon: '✅', message: 'Order #{orderId} has been delivered! Share your experience with a review.' },
  cancelled: { icon: '❌', message: 'Order #{orderId} has been cancelled.' },
  returned: { icon: '↩️', message: 'Order #{orderId} has been returned.' }
};

const sendOrderStatusNotification = async (order, newStatus) => {
  try {
    const template = statusTemplates[newStatus];
    if (!template) return;
    const message = template.message.replace('{orderId}', order.orderId);

    const notification = new Notification({
      message: `${template.icon} ${message}`,
      type: newStatus === 'cancelled' || newStatus === 'returned' ? 'error' : 'success',
      priority: newStatus === 'shipped' || newStatus === 'delivered' ? 'high' : 'medium',
      targetType: 'specific',
      targetUserIds: order.userId ? [order.userId] : [],
      link: `/orders/${order.orderId}`,
      orderId: order._id,
      orderStatus: newStatus,
      isActive: true,
      isDismissible: true
    });

    await notification.save();
    console.log(`📧 Customer notification sent for ${order.orderId}: ${newStatus}`);
    return notification;
  } catch (err) {
    console.error('Customer notification error:', err);
    return null;
  }
};

// ============================================
// ADMIN NOTIFICATION HELPERS
// ============================================
const notifyAdminNewOrder = async (order) => {
  try {
    const notification = new Notification({
      message: `🛍️ New Order #${order.orderId} placed by ${order.customer?.name || 'Guest'} — ₹${order.total}`,
      type: 'info',
      priority: 'high',
      targetType: 'all',
      link: `/admin`,
      orderId: order._id,
      orderStatus: 'pending',
      isActive: true,
      isDismissible: true
    });
    await notification.save();
    console.log(`🔔 Admin notification: New order ${order.orderId}`);

    // ✅ Also send admin email
    try {
      const { sendAdminEmail } = require('../services/emailTemplates');
      await sendAdminEmail(order, 'admin_new_order');
    } catch (e) {
      console.error('Admin new-order email error:', e.message);
    }
  } catch (err) {
    console.error('Admin new-order notification error:', err);
  }
};

const notifyAdminPaymentConfirmed = async (order) => {
  try {
    const notification = new Notification({
      message: `💰 Payment received for Order #${order.orderId} — ₹${order.total} · Ready to ship`,
      type: 'success',
      priority: 'high',
      targetType: 'all',
      link: `/admin`,
      orderId: order._id,
      orderStatus: 'processing',
      isActive: true,
      isDismissible: true
    });
    await notification.save();
    console.log(`🔔 Admin notification: Payment confirmed for ${order.orderId}`);

    // ✅ Also send admin email
    try {
      const { sendAdminEmail } = require('../services/emailTemplates');
      await sendAdminEmail(order, 'admin_payment_confirmed');
    } catch (e) {
      console.error('Admin payment email error:', e.message);
    }
  } catch (err) {
    console.error('Admin payment notification error:', err);
  }
};

const notifyAdminPaymentFailed = async (order, reason) => {
  try {
    const notification = new Notification({
      message: `⚠️ Payment failed for Order #${order.orderId} — ${reason || 'Unknown reason'}`,
      type: 'warning',
      priority: 'high',
      targetType: 'all',
      link: `/admin`,
      orderId: order._id,
      orderStatus: 'failed',
      isActive: true,
      isDismissible: true
    });
    await notification.save();
    console.log(`🔔 Admin notification: Payment failed for ${order.orderId}`);
  } catch (err) {
    console.error('Admin payment-failed notification error:', err);
  }
};

// ============================================
// SPECIFIC ROUTES (BEFORE /:id)
// ============================================

router.get('/my-orders', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Please login' });
    const orders = await Order.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .populate('items.productId', 'name image productId avgRating');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/order/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-orders/:orderId', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Please login' });
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.userId })
      .populate('items.productId', 'name image productId');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:orderId/rate', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    if (!req.userId) return res.status(401).json({ error: 'Please login' });
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }
    const order = await Order.findOne({ orderId, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.postOrderRating) return res.status(400).json({ error: 'Already rated' });

    order.postOrderRating = rating;
    order.postOrderComment = comment || '';
    order.postOrderRatedAt = new Date();
    await order.save();

    res.json({ success: true, message: 'Thank you for your feedback!', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:orderId/cancel', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Please login' });
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const diffMinutes = (new Date() - new Date(order.createdAt)) / (1000 * 60);
    if (diffMinutes > 60) {
      return res.status(400).json({ error: 'Can only cancel within 1 hour' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel in current state' });
    }

    order.status = 'cancelled';
    order.timeline.push({
      status: 'cancelled',
      description: 'Order cancelled by customer',
      timestamp: new Date()
    });
    await order.save();
    await sendOrderStatusNotification(order, 'cancelled');

    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:orderId/timeline', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order.timeline || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PARAMETER ROUTES (AFTER SPECIFIC)
// ============================================

router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const searchRegex = new RegExp(q.trim(), 'i');
    const orders = await Order.find({
      $or: [
        { orderId: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.email': searchRegex },
        { 'customer.phone': searchRegex },
        { 'shiprocket.awbCode': searchRegex }
      ]
    }).sort({ createdAt: -1 }).limit(50);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CREATE ORDER — sends admin notification
// ============================================
router.post('/', async (req, res) => {
  try {
    const orderCount = await Order.countDocuments();
    const orderId = `LOOP-${String(orderCount + 1).padStart(3, '0')}`;
    const userId = req.userId || null;
    const orderData = { ...req.body, orderId };
    if (userId) orderData.userId = userId;

    const { walletUsed = 0, useWallet = false } = req.body;
    let finalTotal = orderData.total || 0;
    let walletDeduction = 0;

    if (useWallet && userId) {
      const user = await User.findById(userId);
      if (user && user.wallet && user.wallet.balance > 0) {
        const balance = user.wallet.balance;
        if (walletUsed > 0 && walletUsed <= balance) {
          walletDeduction = Math.min(walletUsed, finalTotal);
        } else if (balance >= finalTotal) {
          walletDeduction = finalTotal;
        } else {
          walletDeduction = balance;
        }

        finalTotal -= walletDeduction;
        user.wallet.balance -= walletDeduction;
        user.wallet.transactions.push({
          amount: -walletDeduction,
          type: 'debit',
          description: `Payment for order ${orderId}`
        });
        await user.save();

        orderData.walletUsed = walletDeduction;
        orderData.walletRemaining = user.wallet.balance;
        orderData.total = finalTotal;

        if (finalTotal === 0) {
          orderData.paymentStatus = 'paid';
          orderData.paymentMethod = 'wallet';
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
      await Product.findByIdAndUpdate(item.productId, { $inc: { totalSold: item.quantity } });
    }

    if (userId) {
      await sendOrderStatusNotification(order, 'pending');
    }

    // Admin notification — new order placed
    await notifyAdminNewOrder(order);

    // If wallet paid fully, also notify payment confirmed
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      await notifyAdminPaymentConfirmed(order);
    }

    try {
      await sendStatusEmail(order, 'order_confirmed');
      await sendWhatsAppStatus(order, 'order_confirmed');
    } catch (e) {
      console.error('Post-order notification error:', e.message);
    }

    res.status(201).json(order);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message });
  }
});

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
    await sendOrderStatusNotification(order, req.body.status);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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

router.put('/admin/:id/status', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const descriptions = {
      processing: 'Order is being processed',
      shipped: 'Order has been shipped',
      delivered: 'Order has been delivered',
      cancelled: 'Order was cancelled',
      returned: 'Order was returned'
    };

    order.status = status;
    order.timeline.push({
      status,
      description: descriptions[status] || `Status updated to ${status}`,
      timestamp: new Date()
    });
    await order.save();
    await sendOrderStatusNotification(order, status);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/invoice', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

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

    doc.fontSize(24).fillColor('#B8935A').text('LOOP', { align: 'center' });
    doc.fontSize(14).fillColor('#888').text('Make your move', { align: 'center' }).moveDown();
    doc.fontSize(20).fillColor('#000').text('INVOICE', { align: 'center' }).moveDown();
    doc.fontSize(12).fillColor('#333');
    doc.text(`Order ID: ${order.orderId}`, { continued: true })
       .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();
    doc.fontSize(14).fillColor('#B8935A').text('Customer Details');
    doc.fontSize(12).fillColor('#333');
    doc.text(`Name: ${order.customer?.name || 'Guest'}`);
    doc.text(`Email: ${order.customer?.email || 'N/A'}`);
    doc.text(`Phone: ${order.customer?.phone || 'N/A'}`);
    doc.moveDown();
    doc.fontSize(14).fillColor('#B8935A').text('Items Ordered');
    doc.fontSize(12).fillColor('#333');

    order.items.forEach((item) => {
      doc.text(`${item.name} × ${item.quantity} = ₹${item.price * item.quantity}`);
    });

    doc.moveDown();
    doc.fontSize(16).fillColor('#B8935A').text(`Total: ₹${order.total}`, { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#888').text('Thank you for shopping with LOOP!', { align: 'center' });
    doc.end();
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;