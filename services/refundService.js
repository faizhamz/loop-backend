// ============================================
// REFUND SERVICE
// ============================================
// Handles both wallet-credit (instant) and
// Razorpay refunds (3-5 days) with full audit trail.

const Razorpay = require('razorpay');
const Order = require('../models/Order');
const User = require('../models/User');

let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// ============================================
// INITIATE REFUND
// ============================================
const createRazorpayRefund = async (order, method, reason) => {
  const refundAmount = order.total;
  if (refundAmount <= 0) throw new Error('No refundable amount');

  order.refund = order.refund || {};
  order.refund.status = 'pending';
  order.refund.method = method;
  order.refund.amount = refundAmount;
  order.refund.reason = reason;
  order.refund.initiatedAt = new Date();

  if (method === 'wallet') {
    // Instant wallet credit
    const user = await User.findById(order.userId);
    if (!user) throw new Error('User not found for wallet refund');

    user.wallet = user.wallet || { balance: 0, transactions: [] };
    user.wallet.balance += refundAmount;
    user.wallet.transactions.push({
      amount: refundAmount,
      type: 'refund',
      description: `Refund for order ${order.orderId} (${reason})`,
      orderId: order._id,
      createdAt: new Date()
    });
    await user.save();

    order.refund.status = 'completed';
    order.refund.walletCreditedAt = new Date();
    order.refund.completedAt = new Date();

    order.timeline.push({
      status: order.status,
      description: `Refund of ₹${refundAmount} credited to wallet`,
      timestamp: new Date()
    });

    await order.save();

    return {
      method: 'wallet',
      amount: refundAmount,
      status: 'completed',
      creditedAt: order.refund.walletCreditedAt
    };
  }

  // ===== RAZORPAY REFUND =====
  if (!razorpay) throw new Error('Razorpay not configured for refund');

  const paymentId = order.paymentDetails?.razorpay_payment_id;
  if (!paymentId) throw new Error('No Razorpay payment ID on order');

  order.refund.status = 'processing';
  await order.save();

  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(refundAmount * 100), // paise
      notes: {
        orderId: order.orderId,
        reason
      },
      speed: 'normal'
    });

    order.refund.razorpayRefundId = refund.id;
    order.refund.status = 'processing'; // will complete via webhook or manual
    order.timeline.push({
      status: order.status,
      description: `Refund of ₹${refundAmount} initiated via Razorpay (${refund.id}) — 3-5 business days`,
      timestamp: new Date()
    });
    await order.save();

    return {
      method: 'razorpay',
      amount: refundAmount,
      status: 'processing',
      refundId: refund.id,
      estimatedDays: '3-5'
    };
  } catch (err) {
    order.refund.status = 'failed';
    await order.save();
    console.error('Razorpay refund error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.description || 'Refund failed');
  }
};

// ============================================
// COMPLETE REFUND (called from webhook/manual)
// ============================================
const markRefundComplete = async (orderId, refundId) => {
  const order = await Order.findById(orderId);
  if (!order) return null;
  if (order.refund?.status === 'completed') return order;

  order.refund.status = 'completed';
  order.refund.completedAt = new Date();
  order.refund.razorpayRefundId = refundId || order.refund.razorpayRefundId;

  order.timeline.push({
    status: order.status,
    description: `Refund completed`,
    timestamp: new Date()
  });
  await order.save();
  return order;
};

module.exports = {
  createRazorpayRefund,
  markRefundComplete
};