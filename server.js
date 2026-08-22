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

// Import Routes
const bannerRoutes = require('./routes/bannerRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const variantRoutes = require('./routes/variantRoutes');

// ✅ Import Cart Routes
const cartRoutes = require('./routes/cartRoutes');

// ✅ Import Order Routes
const orderRoutes = require('./routes/orderRoutes');

// ✅ Initialize Razorpay with fallback
let razorpay = null;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized');
  } else {
    console.log('⚠️ Razorpay keys missing — payment disabled. Add keys to enable.');
  }
} catch (err) {
  console.log('⚠️ Razorpay initialization failed:', err.message);
}

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.log('❌ MongoDB error:', err));

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

// ============ BANNER ROUTES ============
app.use('/api/banners', bannerRoutes);

// ============ REVIEW ROUTES ============
app.use('/api/reviews', authMiddleware, reviewRoutes);

// ============ CONTACT ROUTES ============
app.use('/api/contact', contactRoutes);

// ============ NOTIFICATION ROUTES ============
app.use('/api/notifications', notificationRoutes);

// ============ VARIANT ROUTES ============
app.use('/api/variants', authMiddleware, variantRoutes);

// ============ ANALYTICS ROUTES ============ 
const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

// ============ UPLOAD ROUTES ============
const uploadRoutes = require('./routes/uploadRoutes');
app.use('/api/upload', uploadRoutes);

// ============ SERVE STATIC FILES ============
app.use('/uploads', express.static('uploads'));

//Category Routes
app.use('/api/categories', categoryRoutes);

// ============ CART ROUTES ============
app.use('/api/cart', authMiddleware, cartRoutes);

// ============ ORDER ROUTES ============

// ✅ UPDATED: Create order with breakdown
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || null;
    const { items, customer, couponCode, couponDiscount = 0, discount = 0 } = req.body;
    
    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Fee Configuration
    const shippingFee = subtotal > 999 ? 0 : 60;
    const platformFee = 20;
    const gstPercent = 12;
    const gstAmount = Math.round((subtotal + shippingFee + platformFee) * (gstPercent / 100));
    const handlingFee = 10;
    
    // Calculate total
    const total = subtotal + shippingFee + platformFee + gstAmount + handlingFee - discount - couponDiscount;
    
    // Generate Order ID
    const orderCount = await Order.countDocuments();
    const orderId = `LOOP-${String(orderCount + 1).padStart(3, '0')}`;
    
    // Create order with full breakdown
    const orderData = {
      orderId,
      userId,
      customer: customer || req.body.customer,
      items: items || req.body.items,
      subtotal,
      shipping: shippingFee,
      platformFee,
      gstPercent,
      gstAmount,
      handlingFee,
      discount,
      couponCode: couponCode || req.body.couponCode || '',
      couponDiscount,
      total,
      paymentMethod: req.body.paymentMethod || 'upi',
      paymentStatus: 'pending',
      status: 'pending',
      timeline: [{
        status: 'pending',
        description: 'Order placed successfully',
        timestamp: new Date()
      }]
    };
    
    const order = new Order(orderData);
    await order.save();
    
    // Update user
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $push: { orderIds: order._id },
        $inc: { totalSpent: total }
      });
    }
    
    // Update product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { totalSold: item.quantity }
      });
    }
    
    // Send notification
    try {
      await notificationService.notifyNewOrder(order);
    } catch (err) {
      console.log('Notification error:', err);
    }
    
    res.status(201).json(order);
    
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Existing order routes
app.use('/api/orders', authMiddleware, orderRoutes);

// ============ PRODUCT ROUTES ============

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

// ============ COUPON ROUTES ============
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

// ============ USER ROUTES ============
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

// ============ AUTH ROUTES ============

// ✅ DUPLICATE CHECK ROUTE
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

// ✅ SIGNUP
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

// ✅ LOGIN (Email or Phone + Password)
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

// ✅ PHONE LOGIN (Legacy)
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

// ✅ UPDATE PROFILE
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

// ✅ GET PROFILE
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

// ✅ GET USER
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

// ============ REFERRAL ROUTES ============

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

// ============ END AUTH & REFERRAL ROUTES ============

// ============ PAYMENT METHOD ROUTES ============

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
// ✅ RAZORPAY PAYMENT ROUTES
// ============================================

// ✅ Create Razorpay Order
app.post('/api/create-razorpay-order', authMiddleware, async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay is not configured. Please add API keys.' });
    }
    
    const { amount, orderId } = req.body;
    
    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: orderId,
      payment_capture: 1
    };
    
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ error: err.message });
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
// ✅ PDF INVOICE GENERATOR (Helper)
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
      
      // Show breakdown in invoice
      doc.fontSize(12).fillColor('#555');
      doc.text(`Subtotal: ₹${order.subtotal}`, 400, totalY, { align: 'right' });
      doc.text(`Shipping: ₹${order.shipping || 60}`, 400, doc.y + 20, { align: 'right' });
      doc.text(`Platform Fee: ₹${order.platformFee || 20}`, 400, doc.y + 20, { align: 'right' });
      doc.text(`GST (${order.gstPercent || 12}%): ₹${order.gstAmount || 0}`, 400, doc.y + 20, { align: 'right' });
      doc.text(`Handling Fee: ₹${order.handlingFee || 10}`, 400, doc.y + 20, { align: 'right' });
      
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

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});