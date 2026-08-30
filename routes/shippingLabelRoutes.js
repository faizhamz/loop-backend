const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const User = require('../models/User');
const ShippingLabel = require('../models/ShippingLabel');
const { generateShippingLabel, saveLabelPDF, deleteLabelPDF } = require('../utils/labelGenerator');

// ============================================
// GENERATE SHIPPING LABEL
// ============================================
router.post('/generate/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courier, courierName, instructions, format } = req.body;
    
    console.log('📦 Generating label for order:', orderId);
    console.log('📦 Data:', { courier, courierName, instructions, format });
    
    // Check admin access
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      console.log('❌ Access denied: User is not admin');
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get order
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    console.log('✅ Order found:', order.orderId);
    
    // Check if label already exists
    let existingLabel = await ShippingLabel.findOne({ orderId });
    if (existingLabel) {
      console.log('📦 Label already exists, overwriting...');
      if (existingLabel.pdfPath) {
        await deleteLabelPDF(order.orderId);
      }
      await ShippingLabel.deleteOne({ orderId });
    }
    
    // Generate tracking number
    const trackingNumber = `LOOP${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    console.log('📦 Tracking number:', trackingNumber);
    
    // Get store info (from env or defaults)
    const storeInfo = {
      name: process.env.STORE_NAME || 'LOOP Store',
      address: process.env.STORE_ADDRESS || '123 Fashion Street',
      city: process.env.STORE_CITY || 'Mumbai',
      state: process.env.STORE_STATE || 'Maharashtra',
      pincode: process.env.STORE_PINCODE || '400001',
      phone: process.env.STORE_PHONE || '+91 98765 43210',
      email: process.env.STORE_EMAIL || 'support@loopstore.in'
    };
    
    // Prepare label data
    const labelData = {
      order,
      label: {
        from: storeInfo,
        to: {
          name: order.customer?.name || 'Customer',
          address: order.customer?.address?.street || 'N/A',
          city: order.customer?.address?.city || 'N/A',
          state: order.customer?.address?.state || 'N/A',
          pincode: order.customer?.address?.pincode || 'N/A',
          phone: order.customer?.phone || 'N/A',
          email: order.customer?.email || 'N/A'
        },
        package: {
          weight: 'N/A',
          items: order.items?.length || 0,
          value: order.total || 0
        },
        tracking: {
          number: trackingNumber,
          courier: courier || 'delhivery',
          courierName: courierName || ''
        },
        instructions: instructions || '',
        format: format || 'thermal-4x6'
      }
    };
    
    console.log('📦 Generating PDF...');
    
    // Generate PDF
    const pdfBuffer = await generateShippingLabel(labelData);
    console.log('✅ PDF generated, size:', pdfBuffer.length);
    
    // Save PDF
    const savedLabel = await saveLabelPDF(order.orderId, pdfBuffer);
    console.log('✅ PDF saved:', savedLabel.filename);
    
    // Save label to database
    const shippingLabel = new ShippingLabel({
      orderId: order._id,
      orderNumber: order.orderId,
      from: labelData.label.from,
      to: labelData.label.to,
      package: labelData.label.package,
      tracking: labelData.label.tracking,
      instructions: labelData.label.instructions,
      format: labelData.label.format,
      pdfUrl: savedLabel.url,
      pdfPath: savedLabel.filepath,
      printedBy: req.userId
    });
    
    await shippingLabel.save();
    console.log('✅ Label saved to database');
    
    // Update order with tracking
    order.tracking = {
      number: trackingNumber,
      courier: courier || 'delhivery',
      courierName: courierName || '',
      updatedAt: new Date()
    };
    await order.save();
    console.log('✅ Order updated with tracking');
    
    res.json({
      success: true,
      message: 'Shipping label generated successfully',
      label: shippingLabel,
      downloadUrl: savedLabel.url,
      trackingNumber
    });
    
  } catch (error) {
    console.error('❌ Label generation error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to generate shipping label',
      details: error.stack
    });
  }
});

// ============================================
// ✅ DOWNLOAD LABEL PDF - UPDATED WITH TOKEN SUPPORT
// ============================================
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query; // ✅ Get token from URL
    const filepath = path.join(__dirname, '../labels', filename);
    
    console.log('📥 Download requested:', filename);
    console.log('📥 Token from query:', token ? 'Present' : 'Missing');
    
    // ✅ Check if file exists
    if (!fs.existsSync(filepath)) {
      console.log('❌ File not found:', filepath);
      return res.status(404).json({ error: 'Label not found' });
    }
    
    // ✅ Check admin access - try multiple methods
    let userId = req.userId;
    
    // Method 1: Check if userId from authMiddleware
    if (userId) {
      console.log('✅ User ID from middleware:', userId);
    }
    
    // Method 2: Try token from URL query
    if (!userId && token) {
      try {
        console.log('🔍 Verifying token from URL...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        console.log('✅ User ID from URL token:', userId);
      } catch (err) {
        console.error('❌ Token verification failed:', err.message);
      }
    }
    
    // Method 3: Try token from Authorization header
    if (!userId) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const authToken = authHeader.split(' ')[1];
          console.log('🔍 Verifying token from Authorization header...');
          const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
          userId = decoded.userId;
          console.log('✅ User ID from header token:', userId);
        } catch (err) {
          console.error('❌ Header token verification failed:', err.message);
        }
      }
    }
    
    // ✅ If still no userId, return error
    if (!userId) {
      console.log('❌ No user ID found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // ✅ Check if user is admin
    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      console.log('❌ User is not admin:', userId);
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    console.log('✅ Admin access granted for user:', user.name);
    
    // ✅ Update printed status
    const label = await ShippingLabel.findOne({ pdfPath: filepath });
    if (label && !label.printed) {
      label.printed = true;
      label.printedAt = new Date();
      await label.save();
      console.log('✅ Label marked as printed');
    }
    
    // ✅ Send file for download
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('❌ Download error:', err);
        res.status(500).json({ error: 'Download failed' });
      } else {
        console.log('✅ Download successful:', filename);
      }
    });
    
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET LABEL FOR ORDER
// ============================================
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query;
    
    console.log('📋 Getting label for order:', orderId);
    
    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check access - try multiple methods
    let userId = req.userId;
    
    // Try token from URL
    if (!userId && token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {}
    }
    
    // Try token from header
    if (!userId) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const authToken = authHeader.split(' ')[1];
          const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
          userId = decoded.userId;
        } catch (err) {}
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if admin OR order owner
    const isAdmin = user.role === 'admin';
    const isOwner = order.userId && order.userId.toString() === userId;
    
    if (!isAdmin && !isOwner) {
      console.log('❌ Access denied for user:', userId);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find label
    const label = await ShippingLabel.findOne({ orderId: order._id });
    if (!label) {
      console.log('❌ Label not found for order:', orderId);
      return res.status(404).json({ error: 'Label not found' });
    }
    
    console.log('✅ Label found for order:', orderId);
    
    res.json({
      label,
      downloadUrl: `/api/labels/download/${label.pdfUrl.split('/').pop()}`
    });
    
  } catch (error) {
    console.error('❌ Get label error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET ALL LABELS (Admin)
// ============================================
router.get('/all', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const labels = await ShippingLabel.find()
      .populate('orderId', 'orderId customer total status')
      .sort({ createdAt: -1 });
    
    res.json(labels);
  } catch (error) {
    console.error('❌ Get labels error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE LABEL
// ============================================
router.delete('/:labelId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const label = await ShippingLabel.findById(req.params.labelId);
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }
    
    // Delete PDF file
    if (label.pdfPath) {
      await deleteLabelPDF(label.orderNumber);
    }
    
    await ShippingLabel.deleteOne({ _id: label._id });
    
    res.json({ success: true, message: 'Label deleted' });
  } catch (error) {
    console.error('❌ Delete label error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;