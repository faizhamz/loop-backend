const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const axios = require('axios');

// Verify UPI Payment (Polling method)
router.post('/verify-upi', async (req, res) => {
  try {
    const { orderId, transactionId } = req.body;
    
    // Check if payment was successful via UPI
    // You can check with your bank's UPI API or use a service like Razorpay
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Simulate verification (replace with actual UPI verification)
    const paymentVerified = true; // In production, check with UPI API
    
    if (paymentVerified) {
      order.paymentStatus = 'paid';
      order.status = 'processing';
      order.timeline.push({
        status: 'processing',
        description: 'Payment confirmed via UPI',
        timestamp: new Date()
      });
      await order.save();
      
      return res.json({ 
        success: true, 
        message: 'Payment verified! Order confirmed.',
        order 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed' 
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Razorpay Webhook (Alternative - Best for auto-confirmation)
router.post('/webhook/razorpay', async (req, res) => {
  try {
    const { event, payload } = req.body;
    
    if (event === 'payment.captured') {
      const orderId = payload.payment.entity.notes.order_id;
      const transactionId = payload.payment.entity.id;
      
      const order = await Order.findOne({ orderId });
      if (order) {
        order.paymentStatus = 'paid';
        order.status = 'processing';
        order.paymentDetails = {
          transactionId,
          razorpayPaymentId: transactionId,
          capturedAt: new Date()
        };
        order.timeline.push({
          status: 'processing',
          description: `Payment confirmed via Razorpay (${transactionId})`,
          timestamp: new Date()
        });
        await order.save();
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;