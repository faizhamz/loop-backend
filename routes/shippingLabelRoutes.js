const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const ShippingLabel = require('../models/ShippingLabel');
const { generateShippingLabel, saveLabelPDF, deleteLabelPDF } = require('../utils/labelGenerator');
const fs = require('fs');
const path = require('path');

// ============================================
// GENERATE SHIPPING LABEL
// ============================================
router.post('/generate/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { courier, courierName, instructions, format } = req.body;
    
    // Check admin access
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if label already exists
    let existingLabel = await ShippingLabel.findOne({ orderId });
    if (existingLabel) {
      // Delete old PDF if exists
      if (existingLabel.pdfPath) {
        await deleteLabelPDF(order.orderId);
      }
      await ShippingLabel.deleteOne({ orderId });
    }
    
    // Generate tracking number
    const trackingNumber = `LOOP${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Get store info (from contact settings or env)
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
          name: order.customer.name || 'Customer',
          address: order.customer.address?.street || 'N/A',
          city: order.customer.address?.city || 'N/A',
          state: order.customer.address?.state || 'N/A',
          pincode: order.customer.address?.pincode || 'N/A',
          phone: order.customer.phone || 'N/A',
          email: order.customer.email || 'N/A'
        },
        package: {
          weight: 'N/A',
          items: order.items.length,
          value: order.total
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
    
    // Generate PDF
    const pdfBuffer = await generateShippingLabel(labelData);
    
    // Save PDF
    const savedLabel = await saveLabelPDF(order.orderId, pdfBuffer);
    
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
    
    // Update order with tracking
    order.tracking = {
      number: trackingNumber,
      courier: courier || 'delhivery',
      courierName: courierName || '',
      updatedAt: new Date()
    };
    await order.save();
    
    res.json({
      success: true,
      message: 'Shipping label generated successfully',
      label: shippingLabel,
      downloadUrl: savedLabel.url,
      trackingNumber
    });
    
  } catch (error) {
    console.error('Label generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DOWNLOAD LABEL PDF
// ============================================
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '../labels', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Label not found' });
    }
    
    // Check admin access
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get label from database
    const label = await ShippingLabel.findOne({ pdfPath: filepath });
    if (label && !label.printed) {
      label.printed = true;
      label.printedAt = new Date();
      await label.save();
    }
    
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET LABEL FOR ORDER
// ============================================
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check access (admin or order owner)
    const user = await User.findById(req.userId);
    const isAdmin = user && user.role === 'admin';
    const isOwner = order.userId && order.userId.toString() === req.userId;
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find label
    const label = await ShippingLabel.findOne({ orderId: order._id });
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }
    
    res.json({
      label,
      downloadUrl: `/api/labels/download/${label.pdfUrl.split('/').pop()}`
    });
    
  } catch (error) {
    console.error('Get label error:', error);
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
    console.error('Get labels error:', error);
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
    console.error('Delete label error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;