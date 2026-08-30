const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const User = require('../models/User');
const { generateShippingLabel } = require('../utils/labelGenerator');

// ============================================
// GENERATE AND DOWNLOAD SHIPPING LABEL
// ============================================
router.post('/generate/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courier, courierName, instructions, format } = req.body;
    
    console.log('📦 Generating label for order:', orderId);
    
    // Check admin access
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Generate tracking number
    const trackingNumber = `LOOP${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Store info
    const storeInfo = {
      name: process.env.STORE_NAME || 'LOOP Store',
      address: process.env.STORE_ADDRESS || '123 Fashion Street',
      city: process.env.STORE_CITY || 'Mumbai',
      state: process.env.STORE_STATE || 'Maharashtra',
      pincode: process.env.STORE_PINCODE || '400001',
      phone: process.env.STORE_PHONE || '+91 98765 43210',
      email: process.env.STORE_EMAIL || 'support@loopstore.in'
    };
    
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
    const pdfBuffer = await generateShippingLabel(labelData);
    console.log('✅ PDF generated, size:', pdfBuffer.length);
    
    // ✅ Update order with tracking
    order.tracking = {
      number: trackingNumber,
      courier: courier || 'delhivery',
      courierName: courierName || '',
      updatedAt: new Date()
    };
    await order.save();
    
    // ✅ SEND PDF DIRECTLY TO BROWSER (NO FILE STORAGE)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=label-${order.orderId}.pdf`,
      'Content-Length': pdfBuffer.length
    });
    
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ Label generation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate shipping label'
    });
  }
});

// ============================================
// ✅ VIEW LABEL (Preview in new tab)
// ============================================
router.get('/preview/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query;
    
    // Check authentication
    let userId = req.userId;
    
    if (!userId && token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {}
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (!order.tracking?.number) {
      return res.status(404).json({ error: 'No tracking number found. Please generate label first.' });
    }
    
    // Regenerate the label for preview
    const storeInfo = {
      name: process.env.STORE_NAME || 'LOOP Store',
      address: process.env.STORE_ADDRESS || '123 Fashion Street',
      city: process.env.STORE_CITY || 'Mumbai',
      state: process.env.STORE_STATE || 'Maharashtra',
      pincode: process.env.STORE_PINCODE || '400001',
      phone: process.env.STORE_PHONE || '+91 98765 43210',
      email: process.env.STORE_EMAIL || 'support@loopstore.in'
    };
    
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
          number: order.tracking.number,
          courier: order.tracking.courier || 'delhivery',
          courierName: order.tracking.courierName || ''
        },
        instructions: '',
        format: 'thermal-4x6'
      }
    };
    
    const pdfBuffer = await generateShippingLabel(labelData);
    
    // ✅ DISPLAY IN BROWSER (for preview)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=label-${order.orderId}.pdf`,
      'Content-Length': pdfBuffer.length
    });
    
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ Preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;