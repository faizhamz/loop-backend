// ============================================
// WHATSAPP CLOUD API SERVICE
// ============================================
// Sends template messages via Meta's WhatsApp Cloud API.
// Requires approved templates in Meta Business Manager.
// Gracefully skips if not configured.

const axios = require('axios');

const API_VERSION = 'v20.0';

const isConfigured = () => {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID
  );
};

// ============================================
// CLEAN PHONE (10-digit Indian → E.164)
// ============================================
const normalizePhone = (phone) => {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 13 && digits.startsWith('091')) return '91' + digits.slice(3);
  return digits;
};

// ============================================
// SEND TEMPLATE MESSAGE
// ============================================
const sendTemplate = async ({ to, templateName, languageCode = 'en', components = [] }) => {
  if (!isConfigured()) {
    console.log(`💬 [SKIPPED - not configured] To: ${to} | Template: ${templateName}`);
    return { skipped: true };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    console.log('💬 Invalid phone:', to);
    return null;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`💬 WhatsApp sent to ${phone}:`, response.data?.messages?.[0]?.id);
    return response.data;
  } catch (err) {
    console.error('💬 WhatsApp error:', err.response?.data || err.message);
    return null;
  }
};

// ============================================
// TEMPLATE MAPPINGS
// ============================================
// NOTE: Template names must match EXACTLY what you register in Meta.
// Body parameters are positional {{1}}, {{2}}, etc.

const templates = {
  order_confirmed: (order) => ({
    templateName: 'loop_order_confirmed',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId },
        { type: 'text', text: `₹${order.total}` }
      ]
    }]
  }),

  order_shipped: (order) => ({
    templateName: 'loop_order_shipped',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId },
        { type: 'text', text: order.shiprocket?.courierName || 'our courier' },
        { type: 'text', text: order.shiprocket?.awbCode || order.tracking?.number || 'N/A' }
      ]
    }]
  }),

  order_out_for_delivery: (order) => ({
    templateName: 'loop_out_for_delivery',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId }
      ]
    }]
  }),

  order_delivered: (order) => ({
    templateName: 'loop_order_delivered',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId }
      ]
    }]
  }),

  order_ndr: (order) => ({
    templateName: 'loop_delivery_failed',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId }
      ]
    }]
  }),

  order_cancelled: (order) => ({
    templateName: 'loop_order_cancelled',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId }
      ]
    }]
  }),

  order_returned: (order) => ({
    templateName: 'loop_return_initiated',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
        { type: 'text', text: order.orderId }
      ]
    }]
  })
};

// ============================================
// SEND STATUS WHATSAPP
// ============================================
const sendWhatsAppStatus = async (order, emailType) => {
  const template = templates[emailType];
  if (!template) {
    console.log(`💬 No WhatsApp template for ${emailType}`);
    return null;
  }

  const phone = order.customer?.phone;
  if (!phone) {
    console.log('💬 No customer phone — skipping');
    return null;
  }

  const { templateName, components } = template(order);
  return sendTemplate({
    to: phone,
    templateName,
    components
  });
};

module.exports = {
  isConfigured,
  normalizePhone,
  sendTemplate,
  sendWhatsAppStatus
};