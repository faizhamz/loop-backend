const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');

dotenv.config();

const app = express();

// ✅ CORS - Allow all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.json());

// Import Models
const Product = require('./models/Product');
const Coupon = require('./models/Coupon');
const Order = require('./models/Order');
const User = require('./models/User');
const PaymentMethod = require('./models/PaymentMethod');
const Banner = require('./models/Banner');
const Review = require('./models/Review');
const Contact = require('./models/Contact');
const Notification = require('./models/Notification');
const categoryRoutes = require('./routes/categoryRoutes');
const { AnalyticsEvent, DailyAnalytics } = require('./models/Analytics');

// Import Routes
const bannerRoutes = require('./routes/bannerRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const variantRoutes = require('./routes/variantRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');

// ============================================
// ✅ RAZORPAY INITIALIZATION
// ============================================
let razorpay = null;
try {
  console.log('🔑 Checking Razorpay keys...');
  console.log('RAZORPAY_KEY_ID exists:', !!process.env.RAZORPAY_KEY_ID);
  console.log('RAZORPAY_KEY_SECRET exists:', !!process.env.RAZORPAY_KEY_SECRET);
  
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized successfully');
  } else {
    console.log('⚠️ Razorpay keys missing — payment disabled');
  }
} catch (err) {
  console.error('❌ Razorpay initialization failed:', err.message);
  razorpay = null;
}

// ============================================
// ✅ TEST ENDPOINT - Check Razorpay Status
// ============================================
app.get('/api/razorpay-status', async (req, res) => {
  try {
    const status = {
      razorpayInitialized: !!razorpay,
      keyIdExists: !!process.env.RAZORPAY_KEY_ID,
      keySecretExists: !!process.env.RAZORPAY_KEY_SECRET,
      keyId: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 10) + '...' : null,
      nodeEnv: process.env.NODE_ENV || 'not set'
    };
    
    // Try to create a test order to verify Razorpay works
    let testOrder = null;
    if (razorpay) {
      try {
        testOrder = await razorpay.orders.create({
          amount: 100,
          currency: 'INR',
          receipt: 'test_receipt'
        });
        status.testOrderSuccess = true;
        status.testOrderId = testOrder.id;
      } catch (testErr) {
        status.testOrderSuccess = false;
        status.testOrderError = testErr.message;
        status.testOrderErrorCode = testErr.code;
      }
    }
    
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
.then(() => {
  console.log('✅ MongoDB connected');
  
  // ✅ START AUTO-CLEANUP AFTER DB CONNECTS
  startAutoCleanup();
})
.catch(err => console.log('❌ MongoDB error:', err));

// ============================================
// ✅ AUTO-CANCEL PENDING ORDERS - Add this function
// ============================================
function startAutoCleanup() {
  // Run once immediately on startup
  cleanupPendingOrders();
  
  // Then run every 5 minutes
  setInterval(() => {
    cleanupPendingOrders();
  }, 5 * 60 * 1000);
  
  console.log('🔄 Auto-cleanup started - checking every 5 minutes');
}

async function cleanupPendingOrders() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await Order.updateMany(
      {
        status: 'pending',
        paymentStatus: 'pending',
        createdAt: { $lt: thirtyMinutesAgo }
      },
      {
        status: 'cancelled',
        paymentStatus: 'failed',
        $push: {
          timeline: {
            status: 'cancelled',
            description: 'Order auto-cancelled - payment not completed within 30 minutes',
            timestamp: new Date()
          }
        }
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`✅ Auto-cancelled ${result.modifiedCount} pending orders`);
    }
  } catch (err) {
    console.error('Auto-cleanup error:', err);
  }
}

// ============ AUTH MIDDLEWARE ============
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    req.userId = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    req.userId = null;
    next();
  }
};

// ============ ADMIN MIDDLEWARE ============
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============ HELPER FUNCTION: Validate Pincode ============
const validatePincode = async (pincode) => {
  try {
    if (!/^\d{6}$/.test(pincode)) {
      return { valid: false, message: 'Pincode must be exactly 6 digits' };
    }
    
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();
    
    if (data[0]?.Status === 'Success') {
      const postOffice = data[0].PostOffice[0];
      return { 
        valid: true, 
        city: postOffice.District || '',
        state: postOffice.State || '',
        message: 'Pincode verified successfully'
      };
    } else {
      return { valid: false, message: 'Invalid pincode. Please enter a valid Indian pincode.' };
    }
  } catch (error) {
    console.error('Pincode validation error:', error);
    return { valid: false, message: 'Could not verify pincode. Please try again.' };
  }
};

// ============ NOTIFICATION SERVICE ============
class NotificationService {
  constructor() {
    this.transporter = null;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const nodemailer = require('nodemailer');
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        console.log('✅ Email service initialized');
      } catch (e) {
        console.log('⚠️ Email service not configured');
      }
    }
  }

  async sendEmail(to, subject, html) {
    if (!this.transporter) {
      console.log('📧 Email would be sent:', { to, subject });
      return null;
    }
    try {
      const info = await this.transporter.sendMail({
        from: `"LOOP Store" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      });
      console.log('📧 Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Email error:', error);
      return null;
    }
  }

  async notifyNewOrder(order) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@loopstore.in';
    const subject = `🛍️ New Order #${order.orderId}`;
    const html = `
      <h2>New Order Received! 🎉</h2>
      <p><strong>Order ID:</strong> ${order.orderId}</p>
      <p><strong>Customer:</strong> ${order.customer?.name || 'Guest'}</p>
      <p><strong>Total:</strong> ₹${order.total}</p>
      <p><strong>Items:</strong> ${order.items?.length || 0} items</p>
      <p><a href="${process.env.ADMIN_URL || 'https://loopstore.in/admin'}">View Order</a></p>
    `;
    return this.sendEmail(adminEmail, subject, html);
  }
}

const notificationService = new NotificationService();

// ============ TEST ROUTE ============
app.get('/', (req, res) => {
  res.json({ message: 'LOOP API is running' });
});

// ============ ROUTES ============
app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', authMiddleware, reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/variants', authMiddleware, variantRoutes);

const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

const uploadRoutes = require('./routes/uploadRoutes');
app.use('/api/upload', uploadRoutes);

app.use('/uploads', express.static('uploads'));

app.use('/api/categories', categoryRoutes);
app.use('/api/cart', authMiddleware, cartRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);

// ============================================
// ✅ RAZORPAY PAYMENT ROUTES - FIXED
// ============================================

// ✅ Create Razorpay Order
app.post('/api/create-razorpay-order', authMiddleware, async (req, res) => {
  console.log('📦 create-razorpay-order called');
  console.log('📦 Request body:', req.body);
  console.log('📦 Razorpay initialized:', !!razorpay);
  
  try {
    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error('❌ Razorpay not initialized - check environment variables');
      return res.status(503).json({ 
        error: 'Razorpay is not configured. Please contact support.',
        details: 'Payment service temporarily unavailable'
      });
    }
    
    const { amount, orderId } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      console.error('❌ Invalid amount:', amount);
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: orderId || `order_${Date.now()}`,
      payment_capture: 1,
      notes: {
        order_id: orderId || 'no_order_id'
      }
    };
    
    console.log('📦 Creating Razorpay order with options:', JSON.stringify(options, null, 2));
    
    const order = await razorpay.orders.create(options);
    console.log('✅ Razorpay order created:', order.id);
    
    res.json(order);
  } catch (err) {
    console.error('❌ Razorpay order error DETAILS:', {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      response: err.response ? JSON.stringify(err.response) : 'no response'
    });
    
    // Send detailed error response for debugging
    res.status(500).json({ 
      error: 'Failed to create payment order',
      details: err.message,
      code: err.code || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ VERIFY RAZORPAY PAYMENT
app.post('/api/verify-razorpay-payment', authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;
    
    console.log('🔍 Verifying payment:', {
      razorpay_payment_id,
      razorpay_order_id,
      orderId
    });
    
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Invalid payment signature!');
      return res.status(400).json({ 
        error: 'Invalid payment signature',
        success: false 
      });
    }
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      console.error('❌ Order not found:', orderId);
      return res.status(404).json({ 
        error: 'Order not found',
        success: false 
      });
    }
    
    if (order.paymentStatus === 'paid') {
      console.log('ℹ️ Order already marked as paid:', orderId);
      return res.json({ 
        success: true, 
        message: 'Order already paid',
        order: order 
      });
    }
    
    try {
      const axios = require('axios');
      const paymentDetails = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        {
          auth: {
            username: process.env.RAZORPAY_KEY_ID,
            password: process.env.RAZORPAY_KEY_SECRET
          }
        }
      );
      
      if (paymentDetails.data.status !== 'captured') {
        console.error('❌ Payment not captured:', paymentDetails.data.status);
        return res.status(400).json({
          error: `Payment not completed. Status: ${paymentDetails.data.status}`,
          success: false
        });
      }
      
      order.paymentStatus = 'paid';
      order.status = 'processing';
      order.paymentMethod = 'razorpay';
      order.paymentDetails = {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        capturedAt: new Date(),
        status: paymentDetails.data.status
      };
      order.timeline.push({
        status: 'processing',
        description: `Payment confirmed via Razorpay (${razorpay_payment_id})`,
        timestamp: new Date()
      });
      
      await order.save();
      console.log('✅ Payment verified and order updated:', orderId);
      
      if (order.userId) {
        await User.findByIdAndUpdate(order.userId, { cart: [] });
        console.log('✅ Cart cleared for user:', order.userId);
      }
      
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock -= item.quantity;
          await product.save();
        }
      }
      
      res.json({ 
        success: true, 
        message: 'Payment verified successfully',
        order: order
      });
      
    } catch (razorpayError) {
      console.error('❌ Razorpay API error:', razorpayError.response?.data || razorpayError.message);
      return res.status(400).json({
        error: 'Payment verification failed. Please contact support.',
        success: false
      });
    }
    
  } catch (err) {
    console.error('❌ Verification error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

// ✅ RAZORPAY WEBHOOK
app.post('/api/razorpay-webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    
    const { event, payload } = req.body;
    console.log('📨 Webhook received:', event);
    
    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.notes?.order_id;
      
      if (orderId) {
        const order = await Order.findOne({ orderId });
        if (order && order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.status = 'processing';
          order.paymentDetails = {
            razorpay_payment_id: payment.id,
            razorpay_order_id: payment.order_id,
            capturedAt: new Date(),
            status: payment.status
          };
          order.timeline.push({
            status: 'processing',
            description: `Payment confirmed via Razorpay webhook (${payment.id})`,
            timestamp: new Date()
          });
          await order.save();
          
          if (order.userId) {
            await User.findByIdAndUpdate(order.userId, { cart: [] });
          }
          
          for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product) {
              product.stock -= item.quantity;
              await product.save();
            }
          }
          
          console.log('✅ Order updated via webhook:', orderId);
        }
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// END RAZORPAY ROUTES
// ============================================

// ============================================
// ✅ PAYMENT VERIFICATION ROUTES
// ============================================

app.get('/api/orders/verify/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      status: order.status,
      order: order
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.userId && order.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    order.paymentStatus = 'paid';
    order.status = 'processing';
    order.timeline.push({
      status: 'processing',
      description: 'Payment confirmed (manual)',
      timestamp: new Date()
    });
    await order.save();
    
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/notify-verification-failed', authMiddleware, async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    
    console.log(`⚠️ PAYMENT VERIFICATION FAILED for Order: ${orderId}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   User: ${req.userId}`);
    console.log(`   Time: ${new Date().toISOString()}`);
    
    res.json({ 
      success: true, 
      message: 'Admin notified',
      orderId: orderId
    });
  } catch (err) {
    console.error('Admin notification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ AUTO-CLEANUP PENDING ORDERS
// ============================================

app.post('/api/admin/cleanup-pending-orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const result = await Order.updateMany(
      {
        status: 'pending',
        paymentStatus: 'pending',
        createdAt: { $lt: thirtyMinutesAgo }
      },
      {
        status: 'cancelled',
        paymentStatus: 'failed',
        $push: {
          timeline: {
            status: 'cancelled',
            description: 'Order auto-cancelled due to payment timeout (30 minutes)',
            timestamp: new Date()
          }
        }
      }
    );
    
    res.json({
      success: true,
      message: `✅ ${result.modifiedCount} pending orders auto-cancelled`,
      cancelledCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/cleanup-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const expiredPendingOrders = await Order.countDocuments({
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: { $lt: thirtyMinutesAgo }
    });
    
    const totalPending = await Order.countDocuments({
      status: 'pending',
      paymentStatus: 'pending'
    });
    
    res.json({
      pendingOrders: totalPending,
      expiredPendingOrders: expiredPendingOrders,
      canCleanup: expiredPendingOrders > 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ ADMIN ANALYTICS DASHBOARD
// ============================================

app.get('/api/admin/analytics/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now);
    startOfMonth.setMonth(startOfMonth.getMonth() - 1);

    const revenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: {
        _id: null,
        total: { $sum: '$total' },
        today: {
          $sum: {
            $cond: [{ $gte: ['$createdAt', startOfDay] }, '$total', 0]
          }
        },
        week: {
          $sum: {
            $cond: [{ $gte: ['$createdAt', startOfWeek] }, '$total', 0]
          }
        },
        month: {
          $sum: {
            $cond: [{ $gte: ['$createdAt', startOfMonth] }, '$total', 0]
          }
        }
      }}
    ]);

    const orderStats = await Order.aggregate([
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);

    const statusCounts = {};
    orderStats.forEach(s => statusCounts[s._id] = s.count);

    const customerStats = await User.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        withOrders: {
          $sum: {
            $cond: [{ $gt: [{ $size: '$orderIds' }, 0] }, 1, 0]
          }
        }
      }}
    ]);

    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      { $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        totalSold: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
      }},
      { $sort: { totalSold: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      revenue: revenue[0] || { total: 0, today: 0, week: 0, month: 0 },
      orders: {
        total: await Order.countDocuments(),
        pending: statusCounts.pending || 0,
        processing: statusCounts.processing || 0,
        shipped: statusCounts.shipped || 0,
        delivered: statusCounts.delivered || 0,
        cancelled: statusCounts.cancelled || 0
      },
      customers: {
        total: customerStats[0]?.total || 0,
        withOrders: customerStats[0]?.withOrders || 0
      },
      topProducts,
      averageOrderValue: revenue[0]?.total ? 
        Math.round(revenue[0].total / (await Order.countDocuments({ paymentStatus: 'paid' }))) : 0
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ PDF INVOICE GENERATOR
// ============================================

const generateInvoice = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

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
    } catch (error) {
      reject(error);
    }
  });
};

// ============================================
// ✅ SITEMAP GENERATOR - SEO
// ============================================

app.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await Product.find().select('productId updatedAt');
    const Category = require('./models/Category');
    const categories = await Category.find().select('slug');
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://loopstore.in';
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    
    sitemap += `<url><loc>${FRONTEND_URL}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>`;
    
    products.forEach(p => {
      sitemap += `<url><loc>${FRONTEND_URL}/product/${p.productId}</loc>
        <lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod>
        <priority>0.8</priority>
        <changefreq>weekly</changefreq></url>`;
    });
    
    categories.forEach(c => {
      sitemap += `<url><loc>${FRONTEND_URL}/category/${c.slug}</loc>
        <priority>0.6</priority>
        <changefreq>weekly</changefreq></url>`;
    });
    
    sitemap += `</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ MARKETING ROUTES
// ============================================

app.get('/api/marketing/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period } = req.query;
    let days = 7;
    if (period === 'today') days = 1;
    if (period === '30days') days = 30;
    if (period === '90days') days = 90;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const orders = await Order.find({
      createdAt: { $gte: startDate },
      paymentStatus: 'paid'
    });
    
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    
    const visitors = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: startDate }
    });
    
    const topProducts = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        totalSold: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
      }},
      { $sort: { totalSold: -1 } },
      { $limit: 10 }
    ]);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayVisitors = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: todayStart }
    });
    
    const visitorCount = visitors.length || 0;
    const orderCount = orders.length || 0;
    const conversionRate = visitorCount > 0 ? (orderCount / visitorCount) * 100 : 0;
    
    const trafficSources = {
      facebook: 0,
      instagram: 0,
      google: 0,
      direct: 0
    };
    
    const productViews = await AnalyticsEvent.countDocuments({
      eventType: 'product_view',
      timestamp: { $gte: startDate }
    });
    
    const addToCartEvents = await AnalyticsEvent.countDocuments({
      eventType: 'add_to_cart',
      timestamp: { $gte: startDate }
    });
    
    const checkoutEvents = await AnalyticsEvent.countDocuments({
      eventType: 'initiate_checkout',
      timestamp: { $gte: startDate }
    });
    
    const purchaseEvents = orderCount;
    
    const totalEvents = productViews + addToCartEvents + checkoutEvents + purchaseEvents || 1;
    
    const pixelEvents = [
      { 
        event: 'ViewContent', 
        count: productViews, 
        percentage: Math.round((productViews / totalEvents) * 100) || 0 
      },
      { 
        event: 'AddToCart', 
        count: addToCartEvents, 
        percentage: Math.round((addToCartEvents / totalEvents) * 100) || 0 
      },
      { 
        event: 'InitiateCheckout', 
        count: checkoutEvents, 
        percentage: Math.round((checkoutEvents / totalEvents) * 100) || 0 
      },
      { 
        event: 'Purchase', 
        count: purchaseEvents, 
        percentage: visitorCount > 0 ? Math.round((purchaseEvents / visitorCount) * 100) : 0 
      }
    ];
    
    const campaigns = [];
    
    res.json({
      visitors: {
        total: visitorCount,
        today: todayVisitors.length || 0,
        week: visitorCount
      },
      conversions: {
        total: orderCount,
        rate: Math.round(conversionRate * 10) / 10,
        bySource: trafficSources
      },
      revenue: {
        total: totalRevenue,
        period: days
      },
      topProducts: topProducts.map(p => ({
        ...p,
        name: p.name || 'Unknown Product',
        revenue: p.revenue || 0
      })),
      campaigns,
      pixelEvents,
      period: days
    });
    
  } catch (err) {
    console.error('Marketing analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marketing/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today },
      paymentStatus: 'paid'
    });
    
    const todayRevenue = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: today },
          paymentStatus: 'paid' 
        } 
      },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    
    const todayVisitors = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: today }
    });
    
    const totalOrders = await Order.countDocuments({ paymentStatus: 'paid' });
    
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    
    const totalVisitors = await AnalyticsEvent.distinct('visitorId');
    
    res.json({
      today: {
        orders: todayOrders,
        revenue: todayRevenue[0]?.total || 0,
        visitors: todayVisitors.length
      },
      total: {
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        visitors: totalVisitors.length
      }
    });
  } catch (err) {
    console.error('Marketing overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marketing/pixel-events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const totalVisitors = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: startDate }
    });
    
    const purchases = await Order.countDocuments({
      createdAt: { $gte: startDate },
      paymentStatus: 'paid'
    });
    
    const productViews = await AnalyticsEvent.countDocuments({
      eventType: 'product_view',
      timestamp: { $gte: startDate }
    });
    
    const addToCartEvents = await AnalyticsEvent.countDocuments({
      eventType: 'add_to_cart',
      timestamp: { $gte: startDate }
    });
    
    const checkoutEvents = await AnalyticsEvent.countDocuments({
      eventType: 'initiate_checkout',
      timestamp: { $gte: startDate }
    });
    
    const totalEvents = productViews + addToCartEvents + checkoutEvents + purchases || 1;
    const visitorCount = totalVisitors.length || 0;
    
    res.json({
      events: [
        { 
          event: 'ViewContent', 
          count: productViews || 0, 
          percentage: Math.round((productViews / totalEvents) * 100) || 0 
        },
        { 
          event: 'AddToCart', 
          count: addToCartEvents || 0, 
          percentage: Math.round((addToCartEvents / totalEvents) * 100) || 0 
        },
        { 
          event: 'InitiateCheckout', 
          count: checkoutEvents || 0, 
          percentage: Math.round((checkoutEvents / totalEvents) * 100) || 0 
        },
        { 
          event: 'Purchase', 
          count: purchases || 0, 
          percentage: visitorCount > 0 ? Math.round((purchases / visitorCount) * 100) : 0 
        }
      ],
      period: parseInt(days)
    });
  } catch (err) {
    console.error('Pixel events error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marketing/track-utm', async (req, res) => {
  try {
    const { utm_source, utm_medium, utm_campaign, utm_term, utm_content, visitorId, userId } = req.body;
    
    const UTMTracking = require('./models/UTMTracking');
    const track = new UTMTracking({
      visitorId: visitorId || 'unknown',
      userId: userId || null,
      utm_source: utm_source || '',
      utm_medium: utm_medium || '',
      utm_campaign: utm_campaign || '',
      utm_term: utm_term || '',
      utm_content: utm_content || '',
      timestamp: new Date()
    });
    await track.save();
    
    res.json({ success: true, message: 'UTM tracked successfully' });
  } catch (err) {
    console.error('UTM tracking error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PRODUCT ROUTES
// ============================================

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    let product = null;

    product = await Product.findOne({ productId: slug });
    if (!product && mongoose.Types.ObjectId.isValid(slug)) {
      product = await Product.findById(slug);
    }
    if (!product) {
      const nameSlug = slug.replace(/-/g, ' ');
      product = await Product.findOne({
        name: { $regex: new RegExp(`^${nameSlug}$`, 'i') }
      });
    }
    if (!product) {
      product = await Product.findOne({
        name: { $regex: new RegExp(slug.replace(/-/g, ' '), 'i') }
      });
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/id/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    if (req.body.productId) {
      const existing = await Product.findOne({ productId: req.body.productId });
      if (existing) {
        return res.status(400).json({ error: 'Product ID already exists. Please use a different ID.' });
      }
    }
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    if (req.body.productId) {
      const existing = await Product.findOne({
        productId: req.body.productId,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ error: 'Product ID already exists. Please use a different ID.' });
      }
    }
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully', productId: req.params.id });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/products/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    product.status = status;
    product.isActive = status === 'active';
    await product.save();
    res.json({ message: `Product status updated to ${status}`, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// COUPON ROUTES
// ============================================

app.get('/api/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons', async (req, res) => {
  try {
    const coupon = new Coupon(req.body);
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(coupon);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/coupons/:id', async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/coupons/:id/toggle', async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ isActive: coupon.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, userId, cartTotal } = req.body;
    const coupon = await Coupon.findOne({ code, isActive: true, isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ valid: false, message: 'Invalid coupon code' });
    }

    const now = new Date();
    if (coupon.validUntil && now > coupon.validUntil) {
      return res.status(400).json({ valid: false, message: 'Coupon has expired' });
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, message: 'Coupon usage limit reached' });
    }

    if (coupon.userSpecific && coupon.userId.toString() !== userId) {
      return res.status(400).json({ valid: false, message: 'This coupon is not valid for your account' });
    }

    if (coupon.minOrderValue > 0 && cartTotal < coupon.minOrderValue) {
      return res.status(400).json({
        valid: false,
        message: `Minimum order of ₹${coupon.minOrderValue} required`
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (cartTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else if (coupon.discountType === 'fixed') {
      discountAmount = coupon.discountValue;
    }

    res.json({
      valid: true,
      discountAmount,
      discountPercent: coupon.discountType === 'percentage' ? coupon.discountValue : 0,
      message: 'Coupon applied successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons/assign-to-user', async (req, res) => {
  try {
    const { userId, discountValue, validDays, reason } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const code = `INSTA-${user.refId || user.name.substring(0,4).toUpperCase()}-${discountValue}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const coupon = new Coupon({
      code,
      name: `${reason} Reward`,
      description: `Special ${discountValue}% off coupon for ${user.name}`,
      discountType: 'percentage',
      discountValue,
      validUntil,
      userSpecific: true,
      userId,
      usageLimit: 1,
      perUserLimit: 1
    });

    await coupon.save();

    user.coupons = user.coupons || [];
    user.coupons.push({
      code,
      discountPercent: discountValue,
      expiresAt: validUntil
    });
    await user.save();

    res.json({ coupon, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/coupons/bulk-generate', async (req, res) => {
  try {
    const { count, discountType, discountValue, validDays } = req.body;
    const coupons = [];
    for (let i = 0; i < count; i++) {
      const code = `BULK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);
      coupons.push({
        code,
        name: 'Bulk Generated Coupon',
        discountType,
        discountValue,
        validUntil,
        usageLimit: 1,
        perUserLimit: 1
      });
    }
    await Coupon.insertMany(coupons);
    res.json({ message: `${count} coupons generated successfully` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// USER ROUTES
// ============================================

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({ ...req.body, password: hashedPassword });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/wallet', async (req, res) => {
  try {
    const { amount, description, expiresInDays } = req.body;
    const user = await User.findById(req.params.id);
    user.wallet = user.wallet || { balance: 0, transactions: [] };
    user.wallet.balance += amount;
    user.wallet.transactions.push({
      amount,
      type: 'credit',
      description,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null
    });
    await user.save();
    res.json({ balance: user.wallet.balance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/auth/check-duplicate', async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (email) {
      const user = await User.findOne({ email });
      if (user) {
        return res.json({ exists: true, field: 'email' });
      }
    }
    
    if (phone) {
      const user = await User.findOne({ phone });
      if (user) {
        return res.json({ exists: true, field: 'phone' });
      }
    }
    
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password, gender, dob, avatar } = req.body;
    
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }
    
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ 
        error: 'This email is already registered. Please login instead.',
        field: 'email'
      });
    }
    
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ 
        error: 'This phone number is already registered. Please login instead.',
        field: 'phone'
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      gender: gender || '',
      dob: dob || null,
      avatar: avatar || '',
      phoneVerified: true,
      emailVerified: true,
      isActive: true
    });
    
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role,
        gender: user.gender,
        dob: user.dob,
        avatar: user.avatar,
        wallet: user.wallet || { balance: 0, transactions: [] },
        addresses: user.addresses || [],
        orderIds: user.orderIds || [],
        isProfileComplete: user.isProfileComplete || false
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    let user = null;
    
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      user = await User.findOne({ phone: cleanPhone });
    } else if (email) {
      user = await User.findOne({ email });
    } else {
      return res.status(400).json({ error: 'Email or phone is required' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Account not found. Please sign up first.' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role,
        gender: user.gender,
        dob: user.dob,
        avatar: user.avatar,
        wallet: user.wallet || { balance: 0, transactions: [] },
        addresses: user.addresses || [],
        orderIds: user.orderIds || [],
        isProfileComplete: user.isProfileComplete || false
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/phone-login', async (req, res) => {
  try {
    const { phone, uid } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    let user = await User.findOne({ phone });
    
    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      const email = `user_${phone.replace(/[^0-9]/g, '')}@phone.loop.in`;
      
      user = new User({
        name: `User_${phone.slice(-4)}`,
        email: email,
        phone: phone,
        password: hashedPassword,
        phoneVerified: true,
        emailVerified: true,
        isActive: true,
        addresses: [],
        orderIds: [],
        reviewIds: []
      });
      await user.save();
      console.log('✅ New user created from phone:', user._id);
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role,
        wallet: user.wallet || { balance: 0, transactions: [] },
        addresses: user.addresses || [],
        orderIds: user.orderIds || []
      }
    });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { gender, dob, avatar, name, phone, avatarBg } = req.body;
    const userId = req.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (gender !== undefined) user.gender = gender;
    if (dob !== undefined) user.dob = dob;
    if (avatar !== undefined) user.avatar = avatar;
    if (avatarBg !== undefined) user.avatarBg = avatarBg;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    
    if (gender || dob) {
      user.isProfileComplete = true;
    }
    
    await user.save();
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role,
        gender: user.gender,
        dob: user.dob,
        avatar: user.avatar,
        avatarBg: user.avatarBg,
        wallet: user.wallet || { balance: 0, transactions: [] },
        addresses: user.addresses || [],
        orderIds: user.orderIds || [],
        isProfileComplete: user.isProfileComplete || false
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }
    res.json({ 
      message: 'Password reset link sent to your email',
      success: true 
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// REFERRAL ROUTES
// ============================================

app.get('/api/referral/settings', async (req, res) => {
  try {
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    res.json({
      isEnabled: settings.isEnabled,
      rewardAmount: settings.rewardAmount,
      minimumOrderValue: settings.minimumOrderValue,
      welcomeBonus: settings.welcomeBonus,
      rewardDescription: settings.rewardDescription,
      maxReferralsPerUser: settings.maxReferralsPerUser
    });
  } catch (err) {
    console.error('Get referral settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/referral/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    const { isEnabled, rewardAmount, minimumOrderValue, rewardDescription, welcomeBonus, maxReferralsPerUser } = req.body;
    
    if (isEnabled !== undefined) settings.isEnabled = isEnabled;
    if (rewardAmount !== undefined) settings.rewardAmount = rewardAmount;
    if (minimumOrderValue !== undefined) settings.minimumOrderValue = minimumOrderValue;
    if (rewardDescription !== undefined) settings.rewardDescription = rewardDescription;
    if (welcomeBonus !== undefined) settings.welcomeBonus = welcomeBonus;
    if (maxReferralsPerUser !== undefined) settings.maxReferralsPerUser = maxReferralsPerUser;
    
    settings.updatedAt = new Date();
    settings.updatedBy = req.userId;
    await settings.save();
    
    res.json({ message: '✅ Referral settings updated successfully', settings });
  } catch (err) {
    console.error('Update referral settings error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/referral/my-info', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('referrals.userId', 'name email phone')
      .populate('referrals.orderId', 'orderId total status');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    
    const totalEarned = user.referrals
      .filter(r => r.status === 'paid')
      .reduce((sum, r) => sum + r.rewardAmount, 0);
    
    const pendingEarnings = user.referrals
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.rewardAmount, 0);
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://loopstore.in';
    
    res.json({
      referralCode: user.referralCode,
      totalReferrals: user.referrals.length,
      totalEarned,
      pendingEarnings,
      walletBalance: user.wallet?.balance || 0,
      referralLink: `${frontendUrl}?ref=${user.referralCode}`,
      referrals: user.referrals,
      settings: {
        rewardAmount: settings.rewardAmount,
        minimumOrderValue: settings.minimumOrderValue,
        welcomeBonus: settings.welcomeBonus,
        isEnabled: settings.isEnabled
      }
    });
  } catch (err) {
    console.error('Get referral info error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/track-click', async (req, res) => {
  try {
    const { referralCode } = req.body;
    console.log(`📊 Referral click tracked: ${referralCode}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Track referral click error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/apply', authMiddleware, async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.userId;
    
    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code is required' });
    }
    
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }
    
    if (referrer._id.toString() === userId) {
      return res.status(400).json({ error: 'You cannot refer yourself' });
    }
    
    const user = await User.findById(userId);
    if (user.referredBy) {
      return res.status(400).json({ error: 'You have already been referred' });
    }
    
    user.referredBy = referrer._id;
    await user.save();
    
    res.json({ 
      success: true, 
      message: `✅ Referral code ${referralCode} applied! You'll get a bonus on your first order.`,
      referrerName: referrer.name
    });
  } catch (err) {
    console.error('Apply referral error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/process-reward', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    
    if (!settings.isEnabled) {
      return res.status(400).json({ error: 'Referral program is currently disabled' });
    }
    
    const user = await User.findById(userId);
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.total < settings.minimumOrderValue) {
      return res.status(400).json({ 
        error: `Minimum order value of ₹${settings.minimumOrderValue} required for referral reward` 
      });
    }
    
    if (user.hasClaimedReferral) {
      return res.status(400).json({ error: 'You have already claimed your referral bonus' });
    }
    
    if (!user.referredBy) {
      return res.status(400).json({ error: 'You were not referred by anyone' });
    }
    
    const referrer = await User.findById(user.referredBy);
    if (!referrer) {
      return res.status(404).json({ error: 'Referrer not found' });
    }
    
    const alreadyRewarded = referrer.referrals.some(r => 
      r.userId.toString() === userId && r.status === 'paid'
    );
    
    if (alreadyRewarded) {
      return res.status(400).json({ error: 'Referral reward already processed' });
    }
    
    const rewardAmount = settings.rewardAmount;
    
    referrer.wallet.balance += rewardAmount;
    referrer.wallet.transactions.push({
      amount: rewardAmount,
      type: 'credit',
      description: `Referral reward for ${user.name} (${user.phone}) - Order #${order.orderId}`
    });
    
    referrer.referrals.push({
      userId: user._id,
      orderId: order._id,
      rewardAmount: rewardAmount,
      status: 'paid',
      rewardedAt: new Date()
    });
    
    await referrer.save();
    
    user.hasClaimedReferral = true;
    await user.save();
    
    if (settings.welcomeBonus > 0) {
      user.wallet.balance += settings.welcomeBonus;
      user.wallet.transactions.push({
        amount: settings.welcomeBonus,
        type: 'credit',
        description: '🎉 Welcome bonus!'
      });
      await user.save();
    }
    
    res.json({
      success: true,
      message: `🎉 You earned ₹${rewardAmount} referral reward!`,
      referrer: {
        name: referrer.name,
        reward: rewardAmount
      },
      newBalance: referrer.wallet.balance
    });
  } catch (err) {
    console.error('Process referral reward error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/referral/leaderboard', async (req, res) => {
  try {
    const topReferrers = await User.find({
      'referrals.status': 'paid'
    })
    .select('name referralCode referrals wallet.balance')
    .sort({ 'referrals': -1 })
    .limit(10);
    
    const leaderboard = topReferrers.map(user => ({
      name: user.name,
      referralCode: user.referralCode,
      totalReferrals: user.referrals.filter(r => r.status === 'paid').length,
      totalEarned: user.referrals
        .filter(r => r.status === 'paid')
        .reduce((sum, r) => sum + r.rewardAmount, 0)
    }));
    
    res.json(leaderboard);
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/referral/admin/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    
    const totalReferrals = await User.aggregate([
      { $unwind: '$referrals' },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]);
    
    const totalPaid = await User.aggregate([
      { $unwind: '$referrals' },
      { $match: { 'referrals.status': 'paid' } },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]);
    
    const totalEarned = await User.aggregate([
      { $unwind: '$referrals' },
      { $match: { 'referrals.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$referrals.rewardAmount' } } }
    ]);
    
    const topReferrers = await User.find({
      'referrals.status': 'paid'
    })
    .select('name referralCode referrals')
    .sort({ 'referrals': -1 })
    .limit(5);
    
    res.json({
      settings,
      stats: {
        totalReferrals: totalReferrals[0]?.total || 0,
        totalPaid: totalPaid[0]?.total || 0,
        totalEarned: totalEarned[0]?.total || 0,
        pendingReferrals: (totalReferrals[0]?.total || 0) - (totalPaid[0]?.total || 0)
      },
      topReferrers: topReferrers.map(u => ({
        name: u.name,
        referralCode: u.referralCode,
        count: u.referrals.filter(r => r.status === 'paid').length
      }))
    });
  } catch (err) {
    console.error('Get referral analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PAYMENT METHOD ROUTES
// ============================================

app.get('/api/payment-methods', async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-methods/active', async (req, res) => {
  try {
    const active = await PaymentMethod.findOne({ isActive: true });
    res.json(active || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment-methods', async (req, res) => {
  try {
    const { upiId, qrCode, name } = req.body;
    const method = new PaymentMethod({ upiId, qrCode, name });
    await method.save();
    res.status(201).json(method);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/payment-methods/:id', async (req, res) => {
  try {
    const { isActive } = req.body;
    if (isActive) {
      await PaymentMethod.updateMany({}, { isActive: false });
    }
    const method = await PaymentMethod.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );
    res.json(method);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/payment-methods/:id', async (req, res) => {
  try {
    await PaymentMethod.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment method deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Marketing API: http://localhost:${PORT}/api/marketing/analytics`);
  console.log(`🗺️  Sitemap: http://localhost:${PORT}/sitemap.xml`);
});