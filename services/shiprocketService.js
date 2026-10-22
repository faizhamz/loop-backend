// ============================================
// SHIPROCKET BUSINESS LOGIC SERVICE
// ============================================
// Wraps raw API calls with LOOP-specific business rules:
// building payloads from orders, calculating weights,
// mapping statuses, orchestrating notifications.

const shiprocket = require('../utils/shiprocket');
const Order = require('../models/Order');
const User = require('../models/User');
const { formatCurrency } = require('../utils/formatters');
const { sendStatusEmail } = require('./emailTemplates');
const { sendWhatsAppStatus } = require('./whatsappService');

// ============================================
// WEIGHT ESTIMATION (grams → kg)
// For perfume: 30ml ≈ 200g, 50ml ≈ 300g, 100ml ≈ 450g
// For clothing: use per-item fallback 300g
// ============================================
const estimateWeight = (items) => {
  let totalGrams = 100; // base packaging
  items.forEach(item => {
    const sizeStr = (item.size || '').toLowerCase();
    let perItem = 300; // default fallback
    if (sizeStr.includes('30ml')) perItem = 200;
    else if (sizeStr.includes('50ml')) perItem = 300;
    else if (sizeStr.includes('100ml')) perItem = 450;
    else if (sizeStr.includes('ml')) {
      const match = sizeStr.match(/(\d+)\s*ml/);
      if (match) perItem = Math.round(parseInt(match[1]) * 4.5);
    }
    totalGrams += perItem * item.quantity;
  });
  return totalGrams / 1000; // convert to kg
};

// ============================================
// BUILD SHIPROCKET ORDER PAYLOAD
// ============================================
const buildShipmentPayload = (order) => {
  const weight = estimateWeight(order.items);
  const orderDate = new Date(order.createdAt).toISOString().slice(0, 10);

  return {
    order_id: order.orderId,
    order_date: orderDate,
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    channel_id: process.env.SHIPROCKET_CHANNEL_ID || '',
    comment: order.customer?.name ? `Order for ${order.customer.name}` : '',
    billing_customer_name: order.customer?.name || 'Customer',
    billing_last_name: '',
    billing_address: order.customer?.address?.street || '',
    billing_address_2: order.customer?.address?.landmark || '',
    billing_city: order.customer?.address?.city || '',
    billing_pincode: order.customer?.address?.pincode || '',
    billing_state: order.customer?.address?.state || '',
    billing_country: 'India',
    billing_email: order.customer?.email || 'customer@loopstore.in',
    billing_phone: (order.customer?.phone || '').replace(/\D/g, '').slice(-10),
    shipping_is_billing: true,
    order_items: order.items.map(item => ({
      name: item.name,
      sku: item.productId?.toString() || item.name,
      units: item.quantity,
      selling_price: item.price,
      discount: '',
      tax: '',
      hsn: ''
    })),
    payment_method: 'Prepaid',
    shipping_charges: order.shipping || 0,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: order.discount || 0,
    sub_total: order.subtotal || order.total,
    length: 15,
    breadth: 15,
    height: 10,
    weight
  };
};

// ============================================
// CREATE SHIPMENT FOR ORDER
// ============================================
const createShipmentForOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  if (order.shiprocket?.shipmentId) {
    throw new Error('Shipment already created for this order');
  }

  // Only allow shipment for paid orders
  if (order.paymentStatus !== 'paid') {
    throw new Error('Cannot create shipment for unpaid order');
  }

  if (!shiprocket.isConfigured()) {
    throw new Error('Shiprocket not configured. Please add credentials to .env');
  }

  const payload = buildShipmentPayload(order);
  console.log('📦 Creating Shiprocket shipment:', order.orderId);

  const response = await shiprocket.createShipment(payload);

  if (!response || !response.shipment_id) {
    throw new Error(response?.message || 'Shiprocket did not return shipment ID');
  }

  // Save shipment info
  order.shiprocket = order.shiprocket || {};
  order.shiprocket.shipmentId = response.shipment_id?.toString();
  order.shiprocket.awbCode = response.awb_code || '';
  order.shiprocket.courierName = response.courier_name || '';
  order.shiprocket.courierCompanyId = response.courier_company_id || null;
  order.shiprocket.currentStatus = 'NEW';
  order.shiprocket.currentStatusCode = 1;

  // Sync into existing tracking fields (used by existing UI)
  if (response.awb_code) {
    order.tracking = order.tracking || {};
    order.tracking.number = response.awb_code;
    order.tracking.courierName = response.courier_name || '';
    order.tracking.url = `https://shiprocket.co/tracking/${response.awb_code}`;
    order.tracking.updatedAt = new Date();
  }

  // Update order status
  if (order.status === 'pending' || order.status === 'processing') {
    order.status = 'processing';
  }

  order.timeline.push({
    status: 'processing',
    description: `Shipment booked via Shiprocket (AWB: ${response.awb_code || 'pending'})`,
    timestamp: new Date()
  });

  await order.save();
  console.log('✅ Shipment created:', response.shipment_id, 'AWB:', response.awb_code);

  return {
    success: true,
    shipmentId: response.shipment_id,
    awbCode: response.awb_code,
    courierName: response.courier_name
  };
};

// ============================================
// GENERATE & FETCH LABEL URL
// ============================================
const getLabelForOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!order.shiprocket?.shipmentId) {
    throw new Error('No shipment exists for this order. Create shipment first.');
  }

  // Check if we already have a label URL cached
  if (order.shiprocket.labelUrl) {
    return { labelUrl: order.shiprocket.labelUrl };
  }

  const response = await shiprocket.generateLabel({
    shipmentId: order.shiprocket.shipmentId
  });

  const labelUrl = response?.label_url || response?.label_created_url;
  if (labelUrl) {
    order.shiprocket.labelUrl = labelUrl;
    await order.save();
  }

  return { labelUrl };
};

// ============================================
// SCHEDULE PICKUP
// ============================================
const schedulePickupForOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!order.shiprocket?.shipmentId) {
    throw new Error('No shipment exists for this order');
  }

  const response = await shiprocket.generatePickup({
    shipmentId: order.shiprocket.shipmentId
  });

  order.shiprocket.pickupScheduledDate = new Date();
  await order.save();

  return response;
};

// ============================================
// CANCEL SHIPMENT
// ============================================
const cancelShipmentForOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!order.shiprocket?.awbCode) {
    throw new Error('No AWB to cancel');
  }

  await shiprocket.cancelShipment([order.shiprocket.awbCode]);

  order.shiprocket.currentStatus = 'CANCELLED';
  order.shiprocket.currentStatusCode = 4;
  order.status = 'cancelled';
  order.timeline.push({
    status: 'cancelled',
    description: 'Shipment cancelled by admin',
    timestamp: new Date()
  });
  await order.save();

  return { success: true };
};

// ============================================
// STATUS MAPPING (Shiprocket → LOOP)
// ============================================
const mapShiprocketStatus = (srStatus, srCode) => {
  const code = parseInt(srCode) || 0;
  const status = (srStatus || '').toUpperCase();

  // Cancelled
  if (code === 4 || code === 5 || status.includes('CANCEL')) {
    return { loStatus: 'cancelled', emailType: 'order_cancelled' };
  }

  // RTO
  if ([23, 24, 25, 26].includes(code) || status.includes('RTO')) {
    return { loStatus: 'returned', emailType: 'order_returned' };
  }

  // Delivered
  if (code === 21 || status === 'DELIVERED') {
    return { loStatus: 'delivered', emailType: 'order_delivered' };
  }

  // Out for delivery
  if (code === 17 || code === 19 || status.includes('OUT FOR DELIVERY')) {
    return { loStatus: 'shipped', emailType: 'order_out_for_delivery' };
  }

  // NDR
  if (code === 18 || code === 22 || status.includes('UNDELIVERED') || status.includes('NDR')) {
    return { loStatus: 'shipped', emailType: 'order_ndr' };
  }

  // Picked up / in transit
  if ([6, 7, 8, 9, 10, 12].includes(code) || status.includes('PICKED') || status.includes('TRANSIT')) {
    return { loStatus: 'shipped', emailType: 'order_shipped' };
  }

  // Pickup scheduled / queued
  if ([1, 2, 3].includes(code) || status.includes('SCHEDULED') || status.includes('QUEUED')) {
    return { loStatus: 'processing', emailType: 'order_processing' };
  }

  return { loStatus: null, emailType: null };
};

// ============================================
// HANDLE WEBHOOK EVENT
// ============================================
const handleWebhookEvent = async (payload) => {
  try {
    const awb = payload.awb || payload.awb_code;
    const srStatus = payload.current_status || payload.shipment_status || '';
    const srCode = payload.current_status_id || payload.shipment_status_id || '';
    const scans = payload.scans || [];

    if (!awb) {
      console.log('⚠️ Webhook missing AWB, skipping');
      return { success: false, reason: 'missing_awb' };
    }

    const order = await Order.findOne({ 'shiprocket.awbCode': awb });
    if (!order) {
      console.log('⚠️ Webhook received for unknown AWB:', awb);
      return { success: false, reason: 'order_not_found' };
    }

    console.log(`📨 Webhook: ${awb} → ${srStatus} (${srCode})`);

    // Update Shiprocket tracking data
    order.shiprocket = order.shiprocket || {};
    order.shiprocket.awbCode = awb;
    order.shiprocket.currentStatus = srStatus;
    order.shiprocket.currentStatusCode = srCode;
    order.shiprocket.lastWebhookAt = new Date();

    if (payload.etd) {
      order.shiprocket.etd = new Date(payload.etd);
    }

    // Append scans
    if (scans.length > 0) {
      order.shiprocket.scans = order.shiprocket.scans || [];
      scans.forEach(scan => {
        const exists = order.shiprocket.scans.some(
          s => s.activity === scan.activity && s.date === scan.date
        );
        if (!exists) {
          order.shiprocket.scans.push({
            activity: scan.activity,
            location: scan.location,
            date: new Date(scan.date)
          });
        }
      });
    }

    // Map status
    const { loStatus, emailType } = mapShiprocketStatus(srStatus, srCode);

    // Update order status only if changed and forward (don't regress)
    const statusOrder = ['pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'];
    const currentIdx = statusOrder.indexOf(order.status);
    const newIdx = statusOrder.indexOf(loStatus);

    let statusChanged = false;
    if (loStatus && loStatus !== order.status) {
      // Allow forward transitions and cancelled/returned transitions
      if (loStatus === 'cancelled' || loStatus === 'returned' || newIdx > currentIdx) {
        order.status = loStatus;
        statusChanged = true;
      }
    }

    // Sync tracking fields
    order.tracking = order.tracking || {};
    order.tracking.number = awb;
    order.tracking.courierName = order.shiprocket.courierName || order.tracking.courierName;
    order.tracking.url = `https://shiprocket.co/tracking/${awb}`;
    order.tracking.updatedAt = new Date();

    // Add timeline entry
    if (statusChanged || scans.length > 0) {
      const latestScan = scans[scans.length - 1];
      order.timeline.push({
        status: loStatus || order.status,
        description: latestScan?.activity || srStatus || 'Status updated',
        timestamp: new Date()
      });
    }

    await order.save();

    // Trigger notifications in parallel (don't block webhook response)
    if (statusChanged && emailType) {
      Promise.all([
        sendStatusEmail(order, emailType).catch(e => console.error('Email error:', e.message)),
        sendWhatsAppStatus(order, emailType).catch(e => console.error('WhatsApp error:', e.message))
      ]).catch(() => {});
    }

    return { success: true, status: order.status, emailType };
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return { success: false, reason: err.message };
  }
};

// ============================================
// CHECK PINCODE SERVICEABILITY
// ============================================
const checkPincodeServiceability = async (deliveryPincode, weight = 0.5) => {
  const pickupPincode = process.env.STORE_PICKUP_PINCODE || '400001';

  if (!shiprocket.isConfigured()) {
    // Graceful fallback for testing without credentials
    console.warn('⚠️ Shiprocket not configured — using fallback response');
    return {
      serviceable: true,
      estimatedDays: 4,
      estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString(),
      couriers: [],
      note: 'Fallback estimate (Shiprocket not configured)'
    };
  }

  try {
    const response = await shiprocket.checkServiceability({
      pickupPincode,
      deliveryPincode,
      weight,
      cod: 0
    });

    const couriers = response?.data?.available_courier_companies || [];

    if (couriers.length === 0) {
      return {
        serviceable: false,
        estimatedDays: null,
        estimatedDelivery: null,
        couriers: [],
        message: 'Not serviceable for this pincode yet'
      };
    }

    // Sort by cheapest or fastest
    const fastest = couriers.reduce((min, c) =>
      (c.estimated_delivery_days < min.estimated_delivery_days ? c : min), couriers[0]);

    const minDays = parseInt(fastest.estimated_delivery_days) || 4;

    return {
      serviceable: true,
      estimatedDays: minDays,
      estimatedDelivery: new Date(Date.now() + minDays * 86400000).toISOString(),
      couriers: couriers.map(c => ({
        name: c.courier_name,
        days: parseInt(c.estimated_delivery_days),
        rate: c.rate
      })),
      recommendedCourier: fastest.courier_name
    };
  } catch (err) {
    console.error('Pincode check error:', err.message);
    return {
      serviceable: false,
      estimatedDays: null,
      estimatedDelivery: null,
      couriers: [],
      error: 'Could not check serviceability'
    };
  }
};

// ============================================
// CREATE RETURN SHIPMENT
// ============================================
const createReturnForOrder = async (orderId, reason = 'Customer return') => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'delivered') {
    throw new Error('Only delivered orders can be returned');
  }

  const weight = estimateWeight(order.items);

  const payload = {
    order_id: `${order.orderId}-R1`,
    order_date: new Date().toISOString().slice(0, 10),
    channel_id: process.env.SHIPROCKET_CHANNEL_ID || '',
    pickup_customer_name: order.customer?.name || 'Customer',
    pickup_last_name: '',
    pickup_address: order.customer?.address?.street || '',
    pickup_address_2: order.customer?.address?.landmark || '',
    pickup_city: order.customer?.address?.city || '',
    pickup_state: order.customer?.address?.state || '',
    pickup_country: 'India',
    pickup_pincode: order.customer?.address?.pincode || '',
    pickup_email: order.customer?.email || '',
    pickup_phone: (order.customer?.phone || '').replace(/\D/g, '').slice(-10),
    shipping_customer_name: 'LOOP Store',
    shipping_last_name: '',
    shipping_address: process.env.STORE_ADDRESS || '123 Fashion Street',
    shipping_city: process.env.STORE_CITY || 'Mumbai',
    shipping_state: process.env.STORE_STATE || 'Maharashtra',
    shipping_country: 'India',
    shipping_pincode: process.env.STORE_PICKUP_PINCODE || '400001',
    shipping_email: process.env.ADMIN_EMAIL || 'support@loopstore.in',
    shipping_phone: process.env.STORE_PHONE || '9876543210',
    order_items: order.items.map(item => ({
      name: item.name,
      sku: item.productId?.toString() || item.name,
      units: item.quantity,
      selling_price: item.price
    })),
    payment_method: 'Prepaid',
    sub_total: order.total,
    length: 15,
    breadth: 15,
    height: 10,
    weight,
    reason
  };

  const response = await shiprocket.createReturnOrder(payload);

  order.shiprocket = order.shiprocket || {};
  order.shiprocket.returnShipmentId = response.shipment_id?.toString();
  order.shiprocket.returnAwbCode = response.awb_code || '';
  order.shiprocket.isReturn = true;

  order.timeline.push({
    status: 'returned',
    description: `Return pickup scheduled (AWB: ${response.awb_code || 'pending'})`,
    timestamp: new Date()
  });

  await order.save();

  return {
    success: true,
    returnShipmentId: response.shipment_id,
    returnAwb: response.awb_code
  };
};

module.exports = {
  estimateWeight,
  buildShipmentPayload,
  createShipmentForOrder,
  getLabelForOrder,
  schedulePickupForOrder,
  cancelShipmentForOrder,
  mapShiprocketStatus,
  handleWebhookEvent,
  checkPincodeServiceability,
  createReturnForOrder
};