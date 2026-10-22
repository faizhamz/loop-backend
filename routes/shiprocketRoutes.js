const express = require('express');
const router = express.Router();
const shiprocketService = require('../services/shiprocketService');
const shiprocket = require('../utils/shiprocket');
const Order = require('../models/Order');
const User = require('../models/User');

// ============================================
// MIDDLEWARES
// ============================================
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ============================================
// PUBLIC — PINCODE CHECK
// ============================================
router.post('/check-pincode', async (req, res) => {
  try {
    const { pincode, weight } = req.body;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: 'Invalid pincode (must be 6 digits)' });
    }

    const result = await shiprocketService.checkPincodeServiceability(
      pincode,
      parseFloat(weight) || 0.5
    );

    res.json(result);
  } catch (err) {
    console.error('Pincode check error:', err);
    res.status(500).json({ error: 'Could not check pincode' });
  }
});

// ============================================
// CUSTOMER — TRACK OWN ORDER
// ============================================
router.get('/track/:orderId', requireAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.userId
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If no AWB yet, return local data
    if (!order.shiprocket?.awbCode) {
      return res.json({
        success: false,
        reason: 'Not shipped yet',
        order: {
          status: order.status,
          timeline: order.timeline
        }
      });
    }

    // Try live fetch
    let liveData = null;
    if (shiprocket.isConfigured()) {
      try {
        liveData = await shiprocket.trackByAwb(order.shiprocket.awbCode);
      } catch (e) {
        console.error('Live track error:', e.message);
      }
    }

    res.json({
      success: true,
      awb: order.shiprocket.awbCode,
      courierName: order.shiprocket.courierName,
      etd: order.shiprocket.etd,
      currentStatus: order.shiprocket.currentStatus,
      scans: order.shiprocket.scans || [],
      trackingUrl: order.tracking?.url,
      liveData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN — CONFIG STATUS
// ============================================
router.get('/status', requireAuth, requireAdmin, (req, res) => {
  res.json({
    configured: shiprocket.isConfigured(),
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    whatsappConfigured: !!(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID
    ),
    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
  });
});

// ============================================
// ADMIN — CREATE SHIPMENT
// ============================================
router.post('/create/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await shiprocketService.createShipmentForOrder(req.params.orderId);
    res.json(result);
  } catch (err) {
    console.error('Create shipment error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — GET LABEL URL
// ============================================
router.get('/label/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await shiprocketService.getLabelForOrder(req.params.orderId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — SCHEDULE PICKUP
// ============================================
router.post('/pickup/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await shiprocketService.schedulePickupForOrder(req.params.orderId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — CANCEL SHIPMENT
// ============================================
router.post('/cancel/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await shiprocketService.cancelShipmentForOrder(req.params.orderId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — CREATE RETURN
// ============================================
router.post('/return/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reason = req.body.reason || 'Customer return';
    const result = await shiprocketService.createReturnForOrder(req.params.orderId, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — NDR LIST
// ============================================
router.get('/ndr', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!shiprocket.isConfigured()) {
      return res.json({ ndrs: [], note: 'Shiprocket not configured' });
    }
    const data = await shiprocket.getNDRList(req.query);
    res.json({ ndrs: data?.data || [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — NDR ACTION
// ============================================
router.post('/ndr/:awb/action', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, comments, phone, address } = req.body;
    if (!['RE-ATTEMPT', 'CHANGE_ADDRESS', 'RETURN'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    const result = await shiprocket.addNDRAction({
      awb: req.params.awb,
      action,
      comments,
      phone,
      address
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — WALLET BALANCE
// ============================================
router.get('/balance', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!shiprocket.isConfigured()) {
      return res.json({ balance: null, note: 'Shiprocket not configured' });
    }
    const data = await shiprocket.getWalletBalance();
    res.json({
      balance: data?.data?.wallet_balance || data?.wallet_balance || null,
      raw: data
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN — DASHBOARD SUMMARY
// ============================================
router.get('/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalShipped,
      inTransit,
      deliveredToday,
      ndrCount,
      pendingShipment
    ] = await Promise.all([
      Order.countDocuments({ 'shiprocket.awbCode': { $exists: true, $ne: '' } }),
      Order.countDocuments({ status: 'shipped' }),
      Order.countDocuments({
        status: 'delivered',
        updatedAt: { $gte: todayStart }
      }),
      Order.countDocuments({ 'shiprocket.ndrAttempts': { $gt: 0 } }),
      Order.countDocuments({
        paymentStatus: 'paid',
        'shiprocket.shipmentId': { $exists: false },
        status: { $in: ['pending', 'processing'] }
      })
    ]);

    res.json({
      configured: shiprocket.isConfigured(),
      totalShipped,
      inTransit,
      deliveredToday,
      ndrCount,
      pendingShipment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;