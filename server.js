const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();

// ============================================
// ✅ FIXED: CORS - Allow only trusted origins
// ============================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://loop-frontend.vercel.app',
  'https://loop-clothing.vercel.app',
  'https://loop-frontend-git-master.vercel.app',
  'https://loop-store.vercel.app',
  // Add your production domain here
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
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

// Import Routes
const bannerRoutes = require('./routes/bannerRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const orderRoutes = require('./routes/orderRoutes');
const variantRoutes = require('./routes/variantRoutes');

// ============================================
// MONGODB CONNECTION
// ============================================
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.log('❌ MongoDB error:', err));

// ============================================
// ✅ FIXED: AUTH MIDDLEWARE
// ============================================
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    req.userId = null;
    req.userRole = null;
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';
    next();
  } catch (err) {
    req.userId = null;
    req.userRole = null;
    next();
  }
};

// ============================================
// ✅ FIXED: ADMIN MIDDLEWARE
// ============================================
const adminMiddleware = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.userId) {
      return res.status(401).json({ 
        error: 'Authentication required. Please login first.' 
      });
    }
    
    // Get user from database
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if user has admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
    // Attach user to request
    req.adminUser = user;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================================
// OPTIONAL AUTH MIDDLEWARE
// ============================================
const optionalAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.userRole = decoded.role || 'user';
    } catch (err) {
      // Invalid token, but we continue
    }
  }
  next();
};

// ============================================
// TEST ROUTE
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'LOOP API is running',
    version: '1.0.0',
    status: 'healthy'
  });
});

// ============================================
// ROUTES
// ============================================
app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', authMiddleware, reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/variants', authMiddleware, variantRoutes);

// ============================================
// ✅ FIXED: PRODUCT ROUTES
// ============================================

// Get all products (public)
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product by slug (public)
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
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Get product by ID (admin only)
app.get('/api/products/id/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIXED: Create product (admin only)
app.post('/api/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (req.body.productId) {
      const existing = await Product.findOne({ productId: req.body.productId });
      if (existing) {
        return res.status(400).json({ error: 'Product ID already exists' });
      }
    }
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ FIXED: Update product (admin only)
app.put('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (req.body.productId) {
      const existing = await Product.findOne({
        productId: req.body.productId,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ error: 'Product ID already exists' });
      }
    }
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ FIXED: Delete product (admin only)
app.delete('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle product status (admin only)
app.patch('/api/products/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
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
// ✅ FIXED: COUPON ROUTES
// ============================================

// Get all coupons (admin only)
app.get('/api/coupons', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single coupon (admin only)
app.get('/api/coupons/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create coupon (admin only)
app.post('/api/coupons', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = new Coupon(req.body);
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update coupon (admin only)
app.put('/api/coupons/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(coupon);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete coupon (admin only)
app.delete('/api/coupons/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle coupon (admin only)
app.patch('/api/coupons/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ isActive: coupon.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate coupon (public)
app.post('/api/coupons/validate', optionalAuthMiddleware, async (req, res) => {
  try {
    const { code, userId, cartTotal } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true, isDeleted: false });

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

// Assign coupon to user (admin only)
app.post('/api/coupons/assign-to-user', authMiddleware, adminMiddleware, async (req, res) => {
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

// Bulk generate coupons (admin only)
app.post('/api/coupons/bulk-generate', authMiddleware, adminMiddleware, async (req, res) => {
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
// ORDER ROUTES
// ============================================
app.use('/api/orders', authMiddleware, orderRoutes);

// ============================================
// ✅ FIXED: USER ROUTES
// ============================================

// Get all users (admin only)
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single user (admin or self)
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Check if user is viewing their own profile or is admin
    if (req.userId !== req.params.id && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user (public)
app.post('/api/users', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({ ...req.body, password: hashedPassword });
    await user.save();
    // Don't return password
    const { password, ...userWithoutPassword } = user.toObject();
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update user (admin or self)
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    // Users can update their own profile, admins can update any
    if (req.userId !== req.params.id && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Don't allow password update here
    const { password, ...updateData } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle user status (admin only)
app.patch('/api/users/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add wallet credit (admin only)
app.post('/api/users/:id/wallet', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.wallet = user.wallet || { balance: 0, transactions: [] };
    user.wallet.balance += amount;
    user.wallet.transactions.push({
      amount,
      type: 'credit',
      description: description || 'Admin credit',
      createdAt: new Date()
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
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email, 
      phone: phone || '', 
      password: hashedPassword, 
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
        refId: user.refId,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
        refId: user.refId,
        role: user.role,
        walletBalance: user.wallet?.balance || 0
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }
    // In production, send email with reset link
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ============================================
// ✅ FIXED: PAYMENT METHOD ROUTES
// ============================================

// Get all payment methods (admin only)
app.get('/api/payment-methods', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active payment method (public)
app.get('/api/payment-methods/active', async (req, res) => {
  try {
    const active = await PaymentMethod.findOne({ isActive: true });
    res.json(active || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create payment method (admin only)
app.post('/api/payment-methods', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { upiId, qrCode, name } = req.body;
    const method = new PaymentMethod({ upiId, qrCode, name });
    await method.save();
    res.status(201).json(method);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update payment method (admin only)
app.put('/api/payment-methods/:id', authMiddleware, adminMiddleware, async (req, res) => {
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

// Delete payment method (admin only)
app.delete('/api/payment-methods/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await PaymentMethod.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment method deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});