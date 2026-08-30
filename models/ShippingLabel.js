const mongoose = require('mongoose');

const shippingLabelSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  orderNumber: { type: String, required: true },
  
  // Sender Info
  from: {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String }
  },
  
  // Receiver Info
  to: {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String }
  },
  
  // Package Details
  package: {
    weight: { type: String, default: 'N/A' },
    items: { type: Number, required: true },
    value: { type: Number, required: true },
    dimensions: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 }
    }
  },
  
  // Shipping Details
  tracking: {
    number: { type: String, required: true },
    courier: { type: String, required: true },
    courierName: { type: String },
    url: { type: String }
  },
  
  // Label Settings
  format: {
    type: String,
    enum: ['thermal-4x6', 'a4', 'a5'],
    default: 'thermal-4x6'
  },
  
  // Additional
  instructions: { type: String, default: '' },
  isReturnLabel: { type: Boolean, default: false },
  
  // File storage
  pdfUrl: { type: String },
  pdfPath: { type: String },
  
  // Status
  printed: { type: Boolean, default: false },
  printedAt: { type: Date },
  printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
shippingLabelSchema.index({ orderId: 1 }, { unique: true });
shippingLabelSchema.index({ trackingNumber: 1 });
shippingLabelSchema.index({ createdAt: -1 });

// Virtual: Label ID
shippingLabelSchema.virtual('labelId').get(function() {
  return `LBL-${this.orderNumber}`;
});

module.exports = mongoose.model('ShippingLabel', shippingLabelSchema);