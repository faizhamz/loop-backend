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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.log('❌ MongoDB error:', err));

// ============ TEST ROUTE ============
app.get('/', (req, res) => {
  res.json({ message: 'LOOP API is running' });
});

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

// Get product by productId (LOOP0001) or by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    // First try to find by productId
    let product = await Product.findOne({ productId: req.params.id });
    // If not found, try by MongoDB _id
    if (!product && mongoose.Types.ObjectId.isValid(req.params.id)) {
      product = await Product.findById(req.params.id);
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create product
app.post('/api/products', async (req, res) => {
  try {
    // If custom productId is provided, check if it's unique
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
    // If productId is being changed, check uniqueness
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

// Delete product - SOFT DELETE (mark as inactive)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    // Soft delete - mark as inactive but keep in database
    product.isActive = false;
    product.status = 'discontinued';
    await product.save();
    res.json({ message: 'Product discontinued', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle product status (active/inactive/discontinued)
app.patch('/api/products/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'active', 'inactive', 'discontinued'
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
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const orderCount = await Order.countDocuments();
    const orderId = `LOOP-${String(orderCount + 1).padStart(3, '0')}`;
    const order = new Order({ ...req.body, orderId });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, phone, password: hashedPassword, emailVerified: true, isActive: true });
    await user.save();
    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, refId: user.refId }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
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
    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        refId: user.refId,
        walletBalance: user.wallet?.balance || 0
      }
    });
  } catch (err) {
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
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});