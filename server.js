const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
const orderRoutes = require('./routes/orderRoutes');
const variantRoutes = require('./routes/variantRoutes');

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

// ============ PRODUCT ROUTES ============

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get product by slug (productId, ID, or name)
app.get('/api/products/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    let product = null;

    // 1. Try by productId
    product = await Product.findOne({ productId: slug });

    // 2. Try by MongoDB _id
    if (!product && mongoose.Types.ObjectId.isValid(slug)) {
      product = await Product.findById(slug);
    }

    // 3. Try by name
    if (!product) {
      const nameSlug = slug.replace(/-/g, ' ');
      product = await Product.findOne({
        name: { $regex: new RegExp(`^${nameSlug}$`, 'i') }
      });
    }

    // 4. Try partial name match
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

// Get product by MongoDB _id (for admin)
app.get('/api/products/id/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create product
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

// Update product
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

// ============ DELETE PRODUCT (Hard Delete) ============
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


// Toggle product status
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

// ============ ORDER ROUTES ============
app.use('/api/orders', authMiddleware, orderRoutes);

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

// ✅ Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Check if phone already exists
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
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
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role 
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Login
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
        phone: user.phone,
        refId: user.refId,
        referralCode: user.referralCode,
        role: user.role,
        walletBalance: user.wallet?.balance || 0
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Phone Login (OTP)
app.post('/api/auth/phone-login', async (req, res) => {
  try {
    const { phone, uid } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Check if user exists with this phone
    let user = await User.findOne({ phone });
    
    if (!user) {
      // Create new user if not exists
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      user = new User({
        name: `User_${phone.slice(-4)}`,
        email: `${phone.replace(/[^0-9]/g, '')}@phone.loop.in`,
        phone: phone,
        password: hashedPassword,
        phoneVerified: true,
        emailVerified: true,
        isActive: true
      });
      await user.save();
    }
    
    // Update phone verification
    user.phoneVerified = true;
    user.lastLogin = new Date();
    await user.save();
    
    // Generate JWT token
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
        walletBalance: user.wallet?.balance || 0
      }
    });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // In production, send email with reset link
    // For now, just return success
    res.json({ 
      message: 'Password reset link sent to your email',
      success: true 
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Get Current User (Me)
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

// ============ REFERRAL ROUTES ============

// ✅ Get referral settings (public)
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

// ✅ Update referral settings (admin only)
app.put('/api/referral/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    const { 
      isEnabled, 
      rewardAmount, 
      minimumOrderValue, 
      rewardDescription, 
      welcomeBonus, 
      maxReferralsPerUser 
    } = req.body;
    
    if (isEnabled !== undefined) settings.isEnabled = isEnabled;
    if (rewardAmount !== undefined) settings.rewardAmount = rewardAmount;
    if (minimumOrderValue !== undefined) settings.minimumOrderValue = minimumOrderValue;
    if (rewardDescription !== undefined) settings.rewardDescription = rewardDescription;
    if (welcomeBonus !== undefined) settings.welcomeBonus = welcomeBonus;
    if (maxReferralsPerUser !== undefined) settings.maxReferralsPerUser = maxReferralsPerUser;
    
    settings.updatedAt = new Date();
    settings.updatedBy = req.userId;
    await settings.save();
    
    res.json({ 
      message: '✅ Referral settings updated successfully', 
      settings 
    });
  } catch (err) {
    console.error('Update referral settings error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Get user's referral info (authenticated)
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
    
    // Calculate earnings
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

// ✅ Track referral click (public)
app.post('/api/referral/track-click', async (req, res) => {
  try {
    const { referralCode } = req.body;
    // Store in session or cookie for later
    // Simple implementation: store in a temporary collection or just log
    console.log(`📊 Referral click tracked: ${referralCode}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Track referral click error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Apply referral code during signup
app.post('/api/referral/apply', authMiddleware, async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.userId;
    
    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code is required' });
    }
    
    // Find referrer
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }
    
    // Check if user is trying to refer themselves
    if (referrer._id.toString() === userId) {
      return res.status(400).json({ error: 'You cannot refer yourself' });
    }
    
    // Check if user already used a referral
    const user = await User.findById(userId);
    if (user.referredBy) {
      return res.status(400).json({ error: 'You have already been referred' });
    }
    
    // Apply referral
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

// ✅ Process referral reward after first order
app.post('/api/referral/process-reward', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    const ReferralSettings = require('./models/ReferralSettings');
    const settings = await ReferralSettings.getSettings();
    
    // Check if referral program is enabled
    if (!settings.isEnabled) {
      return res.status(400).json({ error: 'Referral program is currently disabled' });
    }
    
    // Get user and order
    const user = await User.findById(userId);
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check minimum order value
    if (order.total < settings.minimumOrderValue) {
      return res.status(400).json({ 
        error: `Minimum order value of ₹${settings.minimumOrderValue} required for referral reward` 
      });
    }
    
    // Check if user already claimed referral bonus
    if (user.hasClaimedReferral) {
      return res.status(400).json({ error: 'You have already claimed your referral bonus' });
    }
    
    // Check if user was referred
    if (!user.referredBy) {
      return res.status(400).json({ error: 'You were not referred by anyone' });
    }
    
    // Find referrer
    const referrer = await User.findById(user.referredBy);
    if (!referrer) {
      return res.status(404).json({ error: 'Referrer not found' });
    }
    
    // Check if referrer already got reward for this user
    const alreadyRewarded = referrer.referrals.some(r => 
      r.userId.toString() === userId && r.status === 'paid'
    );
    
    if (alreadyRewarded) {
      return res.status(400).json({ error: 'Referral reward already processed' });
    }
    
    // Give reward to referrer
    const rewardAmount = settings.rewardAmount;
    
    referrer.wallet.balance += rewardAmount;
    referrer.wallet.transactions.push({
      amount: rewardAmount,
      type: 'credit',
      description: `Referral reward for ${user.name} (${user.phone}) - Order #${order.orderId}`
    });
    
    // Add to referrals list
    referrer.referrals.push({
      userId: user._id,
      orderId: order._id,
      rewardAmount: rewardAmount,
      status: 'paid',
      rewardedAt: new Date()
    });
    
    await referrer.save();
    
    // Mark user as having claimed referral
    user.hasClaimedReferral = true;
    await user.save();
    
    // Give welcome bonus to new user (optional)
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

// ✅ Get referral leaderboard (public)
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

// ✅ Admin: Get all referrals analytics
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

// Get all payment methods
app.get('/api/payment-methods', async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active payment method
app.get('/api/payment-methods/active', async (req, res) => {
  try {
    const active = await PaymentMethod.findOne({ isActive: true });
    res.json(active || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create payment method
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

// Update payment method (activate/deactivate)
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

// Delete payment method
app.delete('/api/payment-methods/:id', async (req, res) => {
  try {
    await PaymentMethod.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment method deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CONTACT ROUTES (already registered above) ============

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});