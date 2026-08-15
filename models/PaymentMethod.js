const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'UPI' }, // e.g., "PhonePe UPI"
  upiId: { type: String, required: true }, // e.g., loop@okhdfcbank
  qrCode: { type: String, required: true }, // URL of uploaded QR image
  isActive: { type: Boolean, default: false }, // Only ONE can be active
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);